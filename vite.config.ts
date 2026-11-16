import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/live-data': { target: env.LIVE_DATA_PROXY_TARGET || 'http://127.0.0.1:8002', changeOrigin: true },
        '/api/sensors': { target: env.SENSOR_PROXY_TARGET || 'http://127.0.0.1:8001', changeOrigin: true },
        '/api/v1': { target: env.SHARED_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
        '/api/trade': { target: env.TRADE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
      },
    },
  }
})
