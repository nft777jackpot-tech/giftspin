import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Относительные пути: сайт работает и в корне домена, и в папке, как на GitHub Pages (<аккаунт>.github.io/<проект>/)
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    // Запросы к серверу с кошельком проекта идут через тот же адрес, что и сайт
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
