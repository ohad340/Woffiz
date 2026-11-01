import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations need a session-capable connection (Supabase: session pooler or direct, port 5432).
    // DIRECT_URL is set only when the app's DATABASE_URL is a transaction pooler; otherwise they are the same.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
    // Only "prisma migrate dev" uses this; CI and deployed environments leave it unset.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
})
