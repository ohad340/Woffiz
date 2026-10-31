import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, createEmailVerificationToken } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { MIN_PASSWORD, VERIFY_CALLBACK_PATH } from '@/lib/auth-paths'
import { prisma } from './db'
import { signUpAllowedFor, signUpPolicy } from './email/config'
import { sendAuthEmail } from './email/delivery'
import { AUTH_LINK_TTL_SECONDS } from './email/templates'

// Per-IP attempts per minute on the password endpoints (brute-force defence).
// Tests raise it; production keeps the default.
const attemptsMax = Number(process.env.AUTH_RATE_MAX ?? 5)
const rule = { window: 60, max: Number.isFinite(attemptsMax) && attemptsMax > 0 ? attemptsMax : 5 }
// Per-IP requests per minute on the endpoints that send mail (a per-address limit is in email/delivery.ts).
const emailMax = Number(process.env.AUTH_EMAIL_RATE_MAX ?? 3)
const emailRule = { window: 60, max: Number.isFinite(emailMax) && emailMax > 0 ? emailMax : 3 }

const baseURL = process.env.BETTER_AUTH_URL
const secret = process.env.BETTER_AUTH_SECRET
const policy = signUpPolicy()

const signUpRestricted = (status: 'FORBIDDEN' | 'BAD_REQUEST') =>
  new APIError(status, { code: 'SIGN_UP_RESTRICTED', message: 'Sign-up is not open for this address' })

async function sendVerification(email: string) {
  const token = await createEmailVerificationToken(secret ?? '', email, undefined, AUTH_LINK_TTL_SECONDS)
  const url = `${baseURL}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(VERIFY_CALLBACK_PATH)}`
  await sendAuthEmail('verify-email', email, url)
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret,
  // Every emailed link is built from this, never from the request's Host header.
  baseURL,
  trustedOrigins: baseURL ? [new URL(baseURL).origin] : [],
  // Better Auth skips its origin check when NODE_ENV=test; keep it on everywhere.
  advanced: { disableOriginCheck: false },
  emailAndPassword: {
    enabled: true,
    // Closed, TESTER_EMAIL only, or open on a local machine (see email/config.ts). Enforced per address below.
    disableSignUp: policy.kind === 'closed',
    // No session until the address is verified. Existing accounts are NOT marked verified.
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: AUTH_LINK_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => sendAuthEmail('reset-password', user.email, url),
    // Registering again with an unverified address (for example after a failed send) re-sends the link.
    // The response is the same generic success either way, so it does not reveal the account.
    onExistingUserSignUp: async ({ user }) => {
      if (!user.emailVerified) await sendVerification(user.email)
    },
  },
  emailVerification: {
    sendVerificationEmail: ({ user, url }) => sendAuthEmail('verify-email', user.email, url),
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: AUTH_LINK_TTL_SECONDS,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // 'closed' is answered by disableSignUp above.
      if (ctx.path === '/sign-up/email' && policy.kind !== 'closed' && !signUpAllowedFor(policy, ctx.body?.email)) {
        throw signUpRestricted('FORBIDDEN')
      }
    }),
  },
  databaseHooks: {
    // Second line of defence for any path that creates users. (A 403 here would be masked as success by sign-up.)
    user: {
      create: {
        before: async (user) => {
          if (!signUpAllowedFor(policy, user.email)) throw signUpRestricted('BAD_REQUEST')
        },
      },
    },
  },
  user: {
    additionalFields: {
      // Every new account is an OWNER. `input: false` means clients can never send this field.
      role: { type: 'string', defaultValue: 'OWNER', input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  rateLimit: {
    customRules: {
      '/sign-in/email': rule,
      '/sign-up/email': rule,
      '/reset-password': rule,
      '/send-verification-email': emailRule,
      '/request-password-reset': emailRule,
    },
  },
  plugins: [nextCookies()],
})

export type Auth = typeof auth
