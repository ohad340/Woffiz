import { prisma } from './db'
import { AppError } from './errors'

type Db = Pick<typeof prisma, 'user'>

/**
 * The only place that decides who is an administrator. The role is read from the DATABASE on every call, never
 * from the session cookie or the request, so a revoked ADMIN loses access immediately and a client can never claim it.
 * Anyone else (owner, unverified, unknown) gets NOT_FOUND, so admin endpoints do not reveal that they exist.
 */
export async function assertAdmin(userId: string, db: Db = prisma): Promise<{ id: string; email: string }> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, emailVerified: true } })
  if (!row || row.role !== 'ADMIN' || !row.emailVerified) throw new AppError('NOT_FOUND')
  return { id: row.id, email: row.email }
}
