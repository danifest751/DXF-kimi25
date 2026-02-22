import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, '../core-engine/src'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'dxf-core': [
            path.resolve(__dirname, '../core-engine/src/dxf/reader/index.ts'),
            path.resolve(__dirname, '../core-engine/src/dxf/model/index.ts'),
          ],
          'render-core': [path.resolve(__dirname, '../core-engine/src/render/index.ts')],
        },
      },
    },
  },
});
