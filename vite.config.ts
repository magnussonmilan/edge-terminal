import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Read-only market data proxies (CORS). No trading endpoints proxied.
      '/api/kalshi': {
        target: 'https://external-api.kalshi.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kalshi/, '/trade-api/v2'),
      },
      '/api/polymarket-gamma': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/polymarket-gamma/, ''),
      },
      '/api/polymarket-clob': {
        target: 'https://clob.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/polymarket-clob/, ''),
      },
    },
  },
})
