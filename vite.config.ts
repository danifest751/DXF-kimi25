import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@tests': path.resolve(__dirname, 'tests'),
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
            path.resolve(__dirname, 'src/core/dxf/reader/index.ts'),
            path.resolve(__dirname, 'src/core/dxf/model/index.ts'),
          ],
          'render-core': [path.resolve(__dirname, 'src/core/render/index.ts')],
        },
      },
    },
  },
});
