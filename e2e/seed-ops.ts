// Test helper run by the e2e specs (never by the app), modelled on e2e/seed-media.ts. Local machine only. Commands:
//   admin <email>        makes an existing e2e account an ADMIN
//   failed-jobs <email>  stores three FAILED generation jobs (provider status 503, finished now) for that account's puppy
//   reset-ops            empties the four operational tables and removes the jobs failed-jobs stored earlier (test database only)
//   server-errors        prints the number of SERVER_ERROR events as JSON
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/server/db'
import { isLocalMachine } from '../src/server/local-mode'

const [command, email] = process.argv.slice(2)
if (!command || !isLocalMachine()) throw new Error('usage: seed-ops <command> [email]; local machine only')

if (command === 'admin') {
  await prisma.user.update({ where: { email: email!.toLowerCase() }, data: { role: 'ADMIN' } })
} else if (command === 'failed-jobs') {
  const puppy = await prisma.puppy.findFirstOrThrow({ where: { owner: { email: email!.toLowerCase() } } })
  for (let i = 0; i < 3; i++) {
    await prisma.$executeRaw`
      INSERT INTO "GenerationJob" ("id", "puppyId", "kind", "status", "expectedRevision", "promptVersion", "policyVersion", "model",
        "attempts", "errorCode", "createdAt", "finishedAt", "ownerId", "idempotencyKey", "generation", "leaseExpiresAt")
      VALUES (${randomUUID()}::uuid, ${puppy.id}::uuid, 'ADAPT_CURRENT', 'FAILED', 0, 'p', 'p', 'fake', 2, 'provider status 503',
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), ${puppy.ownerId}, ${`e2e-ops-${randomUUID()}`}, 1,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))`
  }
} else if (command === 'reset-ops') {
  await prisma.$executeRawUnsafe('TRUNCATE "OpsEvent", "OpsAlert", "HousekeepingRun", "PilotMetricDay"')
  await prisma.$executeRaw`DELETE FROM "GenerationJob" WHERE "idempotencyKey" LIKE 'e2e-ops-%'`
} else if (command === 'server-errors') {
  console.log(JSON.stringify({ count: await prisma.opsEvent.count({ where: { kind: 'SERVER_ERROR' } }) }))
} else {
  throw new Error(`unknown command ${command}`)
}
await prisma.$disconnect()
