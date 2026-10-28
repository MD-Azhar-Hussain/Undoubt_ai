import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./tests/management/fixture.js', import.meta.url));
export default defineConfig({
  cacheDir: 'node_modules/.vite-management',
  optimizeDeps: { entries: ['tests/management/app.html'] },
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [{ name: 'management-preview-only', enforce: 'pre', resolveId(source) {
    if (source.endsWith('/utils/http') || source.endsWith('/contexts/AuthContext')) return fixture;
  } }, react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 3200, strictPort: true },
});
