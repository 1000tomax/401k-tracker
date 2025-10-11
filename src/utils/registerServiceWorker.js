/**
 * Service Worker registration with update notification
 * Uses vite-plugin-pwa's virtual module for SW registration
 */

export function registerServiceWorker() {
  // Only register in production
  if (import.meta.env.DEV) {
    console.log('Development mode - Service Worker disabled');
    return;
  }

  // Check if browser supports service workers
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported in this browser');
    return;
  }

  // Dynamic import to avoid bundling SW logic in dev
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: false, // Don't auto-reload

        onNeedRefresh() {
          // New version available
          console.log('New version available! Reload to update.');

          // Show update banner
          window.dispatchEvent(
            new CustomEvent('pwa-update-available', {
              detail: { updateSW }
            })
          );
        },

        onOfflineReady() {
          console.log('App ready to work offline!');

          // Optional: Show "Ready to work offline" message
          window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
        },

        onRegistered(registration) {
          console.log('Service Worker registered:', registration);

          // Check for updates every hour
          if (registration) {
            setInterval(() => {
              registration.update();
            }, 60 * 60 * 1000); // 1 hour
          }
        },

        onRegisterError(error) {
          console.error('Service Worker registration failed:', error);
        }
      });
    })
    .catch((error) => {
      console.error('Failed to load PWA module:', error);
    });
}
