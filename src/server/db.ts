// Server-only: never import this from a client component.
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '@/generated/prisma/client'

export type Tx = Prisma.TransactionClient

/**
 * DATABASE_POOL_MAX=1 is for the local PGlite dev server, which serves one query at a time and
 * drops connections under parallel load. Standard PostgreSQL leaves it unset (pg default pool).
 */
export function createPrisma(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// One client per process, even though Next bundles routes separately (each bundle would otherwise open its own pool).
export const prisma = (globalForPrisma.prisma ??= createPrisma())
