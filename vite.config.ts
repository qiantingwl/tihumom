import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 6188,
    strictPort: true,
    proxy: {
      '/api/': 'http://127.0.0.1:8988',
    },
  },
})
