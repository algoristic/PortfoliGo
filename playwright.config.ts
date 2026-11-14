import { defineConfig, devices } from '@playwright/test';

// System tests against the production build in real browsers (TS §14.1). `npm run e2e` builds
// first; CI tests the build artifact that is deployed.
const isCi = !!process.env['CI'];

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  forbidOnly: isCi,
  retries: 0,
  workers: isCi ? 2 : undefined,
  // Journeys with several jumps, reloads and axe runs take 20–35 s on the two shared vCPUs of a
  // CI runner; locally the default of 30 s stays as a check that they don't get slower.
  timeout: isCi ? 60_000 : 30_000,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs www',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !isCi,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@phone/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@phone/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grepInvert: /@phone/ },
    // Formatting is de-DE in UTC regardless of the user's locale and time zone (TS §11.9).
    {
      name: 'chromium-intl',
      use: { ...devices['Desktop Chrome'], locale: 'en-US', timezoneId: 'America/Los_Angeles' },
      grep: /@intl/,
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] }, grep: /@mobile/ },
  ],
});
