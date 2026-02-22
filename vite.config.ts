import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'packages/core-engine/src'),
      '@store': path.resolve(__dirname, 'src/store'),
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
            path.resolve(__dirname, 'packages/core-engine/src/dxf/reader/index.ts'),
            path.resolve(__dirname, 'packages/core-engine/src/dxf/model/index.ts'),
          ],
          'render-core': [path.resolve(__dirname, 'packages/core-engine/src/render/index.ts')],
        },
      },
    },
  },
});
