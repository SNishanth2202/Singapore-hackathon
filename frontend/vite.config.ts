import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode, command }) => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const backendPort = process.env.PORT || (command === 'serve' && loadEnv(mode, projectRoot, 'PORT').PORT) || '5000'
  return {
    plugins: [react()],
    server: {
      port: 3000,
      watch: { ignored: ['**/test-results/**', '**/showcase-test-results/**', '**/playwright-report/**'] },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  }
})
