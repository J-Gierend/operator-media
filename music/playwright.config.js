import { defineConfig } from '@playwright/test';

// Set to true to test against GitHub Pages, false for local testing
const testRemote = false;

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: testRemote
      ? 'https://j-gierend.github.io/operator-media/'
      : 'http://localhost:8888/',
    headless: true,
    screenshot: 'only-on-failure',
  },
  retries: 0,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
