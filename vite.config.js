import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    // Performance optimizations
    build: {
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: mode === 'production',
          pure_funcs: mode === 'production' ? ['console.log', 'console.info'] : [],
          passes: 2, // Multiple passes for better compression
        },
        mangle: {
          safari10: true, // Fix Safari 10/11 bugs
        },
        format: {
          comments: false, // Remove all comments
        },
      },
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Vendor chunks for better caching and parallel loading
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
              }
              if (id.includes('recharts')) {
                return 'charts';
              }
              if (id.includes('plaid')) {
                return 'plaid';
              }
              if (id.includes('date-fns') || id.includes('lodash')) {
                return 'utils';
              }
              if (id.includes('supabase')) {
                return 'supabase';
              }
              // All other node_modules go to vendor chunk
              return 'vendor';
            }
          },
          // Optimized chunk file naming with content hash
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Optimize chunk size (raised for large bundle)
      chunkSizeWarningLimit: 600,
      // Enable CSS code splitting for better caching
      cssCodeSplit: true,
      // No source maps in production for smaller files
      sourcemap: mode === 'production' ? false : true,
      // Report compressed size for analysis
      reportCompressedSize: true,
      // Increase warning limit for large chunks
      assetsInlineLimit: 4096, // 4kb - inline small assets as base64
    },

    // Enable esbuild optimizations
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: ['@supabase/supabase-js'],
    },

    plugins: [
      react({
        // Enable React Fast Refresh optimizations
        fastRefresh: true,
      }),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icons/*.png'],

        manifest: {
          name: '401k Tracker',
          short_name: '401k Tracker',
          description: 'Monitor your retirement portfolio with automatic daily synchronization',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/icons/icon-72x72.png',
              sizes: '72x72',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-96x96.png',
              sizes: '96x96',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-128x128.png',
              sizes: '128x128',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-144x144.png',
              sizes: '144x144',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-152x152.png',
              sizes: '152x152',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icons/icon-384x384.png',
              sizes: '384x384',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ],
          categories: ['finance', 'business', 'productivity']
        },

        workbox: {
          runtimeCaching: [
            {
              // API requests - Network first with fallback
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 // 24 hours
                },
                networkTimeoutSeconds: 10,
                cacheableResponse: {
                  statuses: [200]
                }
              }
            },
            {
              // Images - Cache first with long expiration
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              // Fonts - Cache first with long expiration
              urlPattern: /\.(?:woff2|woff|ttf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'font-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                }
              }
            },
            {
              // External scripts (e.g., Plaid) - Stale while revalidate
              urlPattern: ({ url }) => url.origin !== self.location.origin,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'external-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
                }
              }
            }
          ],

          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: ['**/node_modules/**/*', '**/*.map'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB
          skipWaiting: false,
          clientsClaim: false,
          navigateFallback: null, // Disable for SPA routing
        },

        devOptions: {
          enabled: false,
          type: 'module'
        }
      }),
      // Bundle analyzer (only in build mode)
      mode === 'production' && visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      })
    ].filter(Boolean),
    server: {
      open: true,
      hmr: {
        overlay: true,
      },
      // Proxy API requests to production in dev mode
      // (Plaid doesn't work well in dev anyway, so just use production)
      proxy: {
        '/api': {
          target: 'https://401k.mreedon.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});