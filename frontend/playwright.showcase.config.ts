import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: '**/showcase.spec.ts', workers: 1, timeout: 180000,
  reporter: [['list'], ['json', { outputFile: 'showcase-test-results/results.json' }]],
  outputDir: 'showcase-test-results',
  use: { baseURL: 'http://127.0.0.1:3217', viewport: { width: 1440, height: 1000 },
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    actionTimeout: 15000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
})
