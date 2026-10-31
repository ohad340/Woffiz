import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { magicLink } from 'better-auth/plugins'
import { prisma } from './db'
import { deliverMagicLink } from './dev-inbox'

const ttl = Number(process.env.MAGIC_LINK_TTL_SECONDS ?? 300)
// Per-IP limit on link requests per minute. Tests raise it; production keeps the default.
const linkRateMax = Number(process.env.MAGIC_LINK_RATE_MAX ?? 5)

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  user: {
    additionalFields: {
      // Every new account is an OWNER. `input: false` means clients can never send this field.
      role: { type: 'string', defaultValue: 'OWNER', input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  plugins: [
    magicLink({
      expiresIn: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
      // Only a hash of the token is stored; the link in the email carries the real value.
      storeToken: 'hashed',
      rateLimit: { window: 60, max: Number.isFinite(linkRateMax) && linkRateMax > 0 ? linkRateMax : 5 },
      sendMagicLink: ({ email, url }) => deliverMagicLink({ email, url }),
    }),
    nextCookies(),
  ],
})

export type Auth = typeof auth
