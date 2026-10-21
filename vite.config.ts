import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const API_TARGET = process.env.XORVYNE_API_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@client': fileURLToPath(new URL('./client/src', import.meta.url)),
    },
  },
  server: {
    // Bind on LAN so a phone can open the dev UI; keep Vite's host-header
    // allowlist enabled to avoid DNS-rebinding exposure from arbitrary domains.
    host: '0.0.0.0',
    port: Number(process.env.XORVYNE_CLIENT_PORT ?? 5173),
    strictPort: false,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
