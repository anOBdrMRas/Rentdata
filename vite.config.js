import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  root: 'client',
  // Statischer Prototyp (GitHub Pages) liegt unter /<repo>/ → relative Pfade
  base: mode === 'static' ? './' : '/',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
}));
