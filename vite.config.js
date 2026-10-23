import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Project Pages is served at /orb-survey/. Local dev stays at /.
const base = process.env.GITHUB_PAGES === 'true' ? '/orb-survey/' : '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Orb Survey',
        short_name: 'Orb Survey',
        description: 'On-site kitchen surveys for Orb Interiors',
        theme_color: '#1f3d4d',
        background_color: '#f3efe6',
        display: 'standalone',
        orientation: 'any',
        lang: 'en-GB',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
