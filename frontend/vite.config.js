import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { socketOrigin } from './src/config/socketEndpoint'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_SOCKET_SERVER_URL?.trim()) socketOrigin(env.VITE_SOCKET_SERVER_URL, env.VITE_FRONTEND_URL || undefined);
  return {
  test: { environment: 'jsdom', include: ['src/**/*.test.jsx'] },
  build: { rollupOptions: { output: { manualChunks: {
    firebase: ['firebase/app', 'firebase/auth'],
    react: ['react', 'react-dom', 'react-router-dom'],
  } } } },
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3108,
    strictPort: true,
    proxy: { '/api': 'http://localhost:6108', '/socket.io': { target: 'http://localhost:6108', ws: true } },
    allowedHosts: ['undoubt-ai.vercel.app', 'undoubt-ai-production.vercel.app', 'localhost', '127.0.0.1']
  }
  };
})
