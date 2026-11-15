import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 45000,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3000', viewport: { width: 1440, height: 1000 },
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm --prefix ../backend run dev:preview', url: 'http://127.0.0.1:5000/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'npm run dev -- --host 127.0.0.1 --port 3000 --strictPort', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
})
