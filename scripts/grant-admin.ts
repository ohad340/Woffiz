// Grants or revokes the ADMIN role for an existing, verified account. Run by the owner, by hand:
//   npx tsx scripts/grant-admin.ts --email you@example.com [--revoke] [--yes-remote]
// It acts on whichever DATABASE_URL is in the environment. The host is printed (never the credentials), and a
// database that is not on this machine needs --yes-remote. There is deliberately no API for this.
import 'dotenv/config'
import { prisma } from '../src/server/db'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const email = args[args.indexOf('--email') + 1]
if (!email || email.startsWith('--')) {
  console.error('Usage: tsx scripts/grant-admin.ts --email <address> [--revoke] [--yes-remote]')
  process.exit(1)
}

const host = new URL(process.env.DATABASE_URL ?? 'postgres://unset').hostname
const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
console.log(`Database host: ${host}${local ? ' (this machine)' : ''}`)
if (!local && !flag('--yes-remote')) {
  console.error('This database is not on this machine. Re-run with --yes-remote if that is what you intend.')
  process.exit(1)
}

const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, role: true, emailVerified: true } })
if (!user) {
  console.error('No account with that address.')
  process.exit(1)
}
if (!flag('--revoke') && !user.emailVerified) {
  console.error('That account has not verified its address yet; it cannot become an administrator.')
  process.exit(1)
}
const role = flag('--revoke') ? 'OWNER' : 'ADMIN'
await prisma.user.update({ where: { id: user.id }, data: { role } })
console.log(`Role of ${email.toLowerCase()} is now ${role}.`)
await prisma.$disconnect()
