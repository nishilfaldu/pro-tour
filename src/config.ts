// The Playwright config `pro-tour run` records one tour with. The tour's file and the run's settings come
// from the environment the recorder sets.
import { dirname, join } from 'node:path';
import { defineConfig } from 'playwright/test';

const { PRO_TOUR_FILE: file = '', PRO_TOUR_WORK: work = '', PRO_TOUR_CHANNEL: channel = 'chromium' } = process.env;

export default defineConfig({
  testDir: dirname(file),
  testMatch: new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
  testIgnore: [],
  // Playwright's own output stays in the recorder's temporary directory.
  outputDir: join(work, 'output'),
  reporter: [['json', { outputFile: join(work, 'report.json') }]],
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 5000 },
  use: {
    headless: true,
    ...(channel === 'chromium' ? {} : { channel }),
    // How long an action waits for its element: a wrong locator fails a repair round in seconds, not 30.
    actionTimeout: 10_000,
    // A dev server may compile a page on its first visit.
    navigationTimeout: 30_000,
    video: 'off',
    trace: 'off',
    screenshot: 'off',
  },
});
