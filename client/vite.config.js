import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The app is served at cleartable.app/app/* in production (landing page lives
// at the root). On `npm run build`, set `base: '/app/'` so Vite emits asset
// URLs like `/app/assets/...` — Express serves the dist from /app/, so the
// paths line up. In dev (`npm run dev`), base stays `/` for local sanity:
// http://localhost:5173 works without the /app prefix.
//
// React Router picks up the right basename automatically via
// import.meta.env.BASE_URL (Vite injects this at build time).
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/app/' : '/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        // 'prompt' lets the app show a glass "Reload to update" banner
        // (client/src/components/UpdatePrompt.jsx) when a new SW is waiting,
        // so users on long-running sessions don't keep seeing the old build.
        registerType: 'prompt',
        // Vite copies anything under client/public/ to dist/, but vite-plugin-pwa
        // needs to know which of those are referenced from the manifest/HTML so
        // it can include them in the SW precache.
        includeAssets: [
          'favicon.png',
          'icons/apple-touch-icon.png',
        ],
        manifest: {
          name: 'Cleartable',
          short_name: 'Cleartable',
          description: 'The calm GTD app — capture, clarify, review.',
          // Theme + bg colors match the in-app dark aesthetic so the iOS/Android
          // splash screen doesn't flash white before the app loads.
          theme_color: '#0b0b13',
          background_color: '#0b0b13',
          display: 'standalone',
          orientation: 'any',
          // Scope + start_url under /app/ so the installed PWA opens the app
          // directly (not the marketing landing page).
          scope: '/app/',
          start_url: '/app/',
          icons: [
            {
              src: '/app/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/app/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/app/icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Precache hashed Vite assets. NEVER precache /api/* — task data must
          // be fresh on every request, not served from a stale cache.
          navigateFallbackDenylist: [/^\/api\//],
          // Tell Workbox to skip API requests entirely so they go to the network.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
        },
        // Dev mode: don't generate a SW (it can stick around and serve stale
        // assets even after the dev server restarts).
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
