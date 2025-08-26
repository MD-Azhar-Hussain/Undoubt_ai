import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['expresso-frontend.onrender.com','undoubt.onrender.com','expresso-app.vercel.app','undoubt-nine.vercel.app']
  }
})
