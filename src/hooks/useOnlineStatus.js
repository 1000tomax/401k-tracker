import { useState, useEffect } from 'react';

/**
 * Hook to detect online/offline status
 * Returns: boolean indicating if user is online
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      console.log('Connection restored - online');
    }

    function handleOffline() {
      setIsOnline(false);
      console.log('Connection lost - offline');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
