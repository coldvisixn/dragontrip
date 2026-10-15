import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  root: 'frontend',
  plugins: [react(), tailwind()],
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 600 },
});
