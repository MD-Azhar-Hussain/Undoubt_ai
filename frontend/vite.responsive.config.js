import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./tests/responsive/fixtures.js', import.meta.url));
export default defineConfig({
  cacheDir: 'node_modules/.vite-responsive',
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [{ name: 'isolated-layout-fixtures', enforce: 'pre', resolveId(source) {
    if (['../contexts/AuthContext', '../utils/socket', '../utils/http', './http'].includes(source)) return fixture;
  } }, react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 3199, strictPort: true },
});
