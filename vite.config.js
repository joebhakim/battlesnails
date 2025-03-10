import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    open: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
}); 