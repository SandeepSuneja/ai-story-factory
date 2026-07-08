import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Match NestJS video timeout (48 h) — default Vite proxy ~120s drops long /generate/video calls.
const PROXY_TIMEOUT_MS = 48 * 60 * 60 * 1000;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
      },
      '/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
      },
      '/videos': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
      },
      '/audio': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
      },
    },
  },
})
