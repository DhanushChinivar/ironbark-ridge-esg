import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The API's response schemas, imported directly rather than copied. If a
      // contract changes, this build breaks.
      '@contracts': fileURLToPath(new URL('../src/contracts/index.ts', import.meta.url)),
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
