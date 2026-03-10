import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.+\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'DXF Viewer',
        short_name: 'DXF',
        description: 'DXF viewer, nesting and optimization tool',
        theme_color: '#0a0f1a',
        background_color: '#0a0f1a',
        display: 'standalone',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
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
