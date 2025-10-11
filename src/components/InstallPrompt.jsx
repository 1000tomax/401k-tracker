import React, { useState, useEffect } from 'react';

/**
 * Optional: Simple A2HS (Add to Home Screen) prompt
 * Shows once per session if not installed
 * Can be dismissed and won't show again
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    const dismissed = sessionStorage.getItem('install-prompt-dismissed');
    if (dismissed) return;

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    let timeoutId;

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the default prompt
      e.preventDefault();

      // Store the event for later use
      setDeferredPrompt(e);

      // Show our custom prompt after a delay (non-intrusive)
      timeoutId = setTimeout(() => {
        setShowPrompt(true);
      }, 10000); // Wait 10 seconds after page load
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`Install prompt outcome: ${outcome}`);

    // Clear the prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
    sessionStorage.setItem('install-prompt-dismissed', 'true');
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('install-prompt-dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="install-prompt" role="dialog" aria-labelledby="install-title">
      <div className="install-content">
        <span className="install-icon">📱</span>
        <div className="install-text">
          <strong id="install-title">Install 401k Tracker</strong>
          <span>Add to your home screen for quick access and offline use.</span>
        </div>
        <div className="install-actions">
          <button
            className="install-button primary"
            onClick={handleInstall}
            aria-label="Install app"
          >
            Install
          </button>
          <button
            className="install-button secondary"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
