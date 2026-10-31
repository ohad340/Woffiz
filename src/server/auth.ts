import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { prisma } from './db'
import { signUpEnabled } from './local-mode'

// Per-IP attempts per minute on the password endpoints (brute-force defence).
// Tests raise it; production keeps the default.
const attemptsMax = Number(process.env.AUTH_RATE_MAX ?? 5)
const rule = { window: 60, max: Number.isFinite(attemptsMax) && attemptsMax > 0 ? attemptsMax : 5 }

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Closed everywhere except a local machine until addresses can be verified (see local-mode.ts).
    disableSignUp: !signUpEnabled(),
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      // Every new account is an OWNER. `input: false` means clients can never send this field.
      role: { type: 'string', defaultValue: 'OWNER', input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  rateLimit: { customRules: { '/sign-in/email': rule, '/sign-up/email': rule } },
  plugins: [nextCookies()],
})

export type Auth = typeof auth
