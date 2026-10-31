import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const database = process.env.TEST_DATABASE_URL
if (!database) throw new Error('TEST_DATABASE_URL is required for e2e tests (see .env.example).')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'he-IL' },
  projects: [
    { name: 'mobile-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } } },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: database,
      // PGlite (local) needs a single connection; CI runs standard PostgreSQL.
      ...(process.env.TEST_DB_KIND === 'postgres' ? {} : { DATABASE_POOL_MAX: '1' }),
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      APP_ENV: 'local',
      DEV_EMAIL_INBOX: 'true',
      MAGIC_LINK_RATE_MAX: '10000',
    },
  },
})
