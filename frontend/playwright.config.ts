import { defineConfig } from '@playwright/test'
import path from 'node:path'
export default defineConfig({
  testDir: './e2e', testIgnore: '**/showcase.spec.ts', fullyParallel: false, workers: 1, timeout: 45000,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3010', viewport: { width: 1440, height: 1000 },
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm --prefix ../backend run dev:preview', url: 'http://127.0.0.1:5010/api/v1/health', reuseExistingServer: process.env.PW_REUSE_SERVERS === 'true', timeout: 60000,
      env: { PORT: '5010', LEAD_RANKING_MODE: 'rules', CORS_ORIGIN: 'http://127.0.0.1:3010',
        LEAD_RANKING_STATE_PATH: path.resolve('..', '.local', 'e2e-ranking-state.json') } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 3010 --strictPort', url: 'http://127.0.0.1:3010', reuseExistingServer: process.env.PW_REUSE_SERVERS === 'true', timeout: 60000,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:5010' } },
  ],
})
