import { defineConfig, devices } from '@playwright/test'

// The app has one "today": the hotel's calendar day in `hotel.timezone` (tests/e2e/setup-draft.mjs sets Europe/Istanbul).
// Specs, the Electron app and the phone harness inherit this zone, so a UTC runner agrees with the app about the date
// between 21:00 and 24:00 UTC.
process.env['TZ'] = 'Europe/Istanbul'

// Two projects (faz-01 madde 9): the real Electron app (built `out/`), and the same React bundle in a
// phone-sized Chromium served over HTTP by the server-mode skeleton (tests/e2e/mobile/server.ts).
// Run `npm run build` first. On Linux CI wrap in xvfb-run.
const chromiumPath = process.env['PW_CHROMIUM_PATH']
// E2E_PORT lets two runs (or a review script) use their own phone harness without meeting each other's server.
const MOBILE_PORT = Number(process.env['E2E_PORT'] ?? 47373)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'electron', testDir: 'tests/e2e/electron' },
    {
      name: 'mobile',
      testDir: 'tests/e2e/mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        baseURL: `http://127.0.0.1:${MOBILE_PORT}`,
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {})
      }
    }
  ],
  webServer: {
    command: 'npx tsx --tsconfig tsconfig.node.json tests/e2e/mobile/server.ts',
    url: `http://127.0.0.1:${MOBILE_PORT}/`,
    env: { E2E_PORT: String(MOBILE_PORT), E2E_CAMERA: '1', TZ: 'Europe/Istanbul' },
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000
  }
})
