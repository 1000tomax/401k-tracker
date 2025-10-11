import React, { useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Banner that shows when user goes offline
 * Auto-hides when connection is restored
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [showOffline, setShowOffline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateCallback, setUpdateCallback] = useState(null);

  // Show offline banner
  useEffect(() => {
    if (!isOnline) {
      setShowOffline(true);
    } else {
      // Delay hiding for smooth transition
      const timer = setTimeout(() => setShowOffline(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  // Listen for PWA update events
  useEffect(() => {
    const handleUpdateAvailable = (event) => {
      setUpdateAvailable(true);
      // Store the actual function, not a function that returns the function
      setUpdateCallback(() => () => event.detail.updateSW(true));
    };

    const handleOfflineReady = () => {
      console.log('App cached and ready for offline use');
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);
    window.addEventListener('pwa-offline-ready', handleOfflineReady);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
      window.removeEventListener('pwa-offline-ready', handleOfflineReady);
    };
  }, []);

  const handleUpdate = () => {
    if (updateCallback) {
      updateCallback(); // Call the wrapped function
    }
  };

  // Don't render anything if online and no updates
  if (isOnline && !updateAvailable) return null;

  return (
    <>
      {/* Offline Banner */}
      {showOffline && (
        <div className="offline-banner" role="alert" aria-live="polite">
          <div className="offline-content">
            <span className="offline-icon">📡</span>
            <div className="offline-text">
              <strong>You're offline</strong>
              <span>Viewing cached data. Reconnect for live updates.</span>
            </div>
          </div>
        </div>
      )}

      {/* Update Available Banner */}
      {updateAvailable && (
        <div className="update-banner" role="alert" aria-live="polite">
          <div className="update-content">
            <span className="update-icon">✨</span>
            <div className="update-text">
              <strong>New version available</strong>
              <span>Reload to get the latest features and fixes.</span>
            </div>
            <button
              className="update-button"
              onClick={handleUpdate}
              aria-label="Update to new version"
            >
              Reload
            </button>
          </div>
        </div>
      )}
    </>
  );
}
