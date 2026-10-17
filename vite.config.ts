import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Static app: no server. `base: './'` lets the build run from any folder or sub-path (e.g. GitHub Pages).
export default defineConfig({
  root: 'client',
  base: './',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'sites.json'],
      manifest: {
        name: 'DiveDex — Dive Log & Marine Life',
        short_name: 'DiveDex',
        description: 'Scuba dive logbook and marine-life collection',
        theme_color: '#06202a',
        background_color: '#041319',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}', '**/*latin*.woff2', '**/*hebrew*.woff2'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /^https:\/\/(upload|thumb)\.wikimedia\.org\/|^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/|^https:\/\/api\.gbif\.org\/v1\/image/, handler: 'CacheFirst',
            options: { cacheName: 'dd-species-images', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 86400 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /^https:\/\/server\.arcgisonline\.com\//, handler: 'CacheFirst',
            options: { cacheName: 'dd-map-tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 86400 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
});
