import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

/**
 * Banner that shows when Plaid connection is missing or stale
 * - No connections: Shows error that no Plaid connections exist
 * - Stale connection: Shows warning if last sync was > 5 days ago
 */
export default function PlaidConnectionBanner() {
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkPlaidConnections();
  }, []);

  const checkPlaidConnections = async () => {
    try {
      const response = await fetch(`${API_URL}/api/db/plaid`, {
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
      });

      if (!response.ok) {
        console.error('Failed to check Plaid connections');
        return;
      }

      const data = await response.json();
      const connections = data.connections || [];

      if (connections.length === 0) {
        setConnectionStatus({ type: 'missing', message: 'No Plaid connections found' });
        return;
      }

      // Check if any connection is stale (last sync > 5 days ago)
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      for (const conn of connections) {
        const lastSync = conn.last_synced_at ? new Date(conn.last_synced_at) : null;

        if (!lastSync || lastSync < fiveDaysAgo) {
          const daysSinceSync = lastSync
            ? Math.floor((Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          setConnectionStatus({
            type: 'stale',
            institution: conn.institution_name,
            daysSinceSync,
            message: lastSync
              ? `${conn.institution_name} hasn't synced in ${daysSinceSync} days`
              : `${conn.institution_name} has never synced`,
          });
          return;
        }
      }

      // All connections are healthy
      setConnectionStatus(null);
    } catch (error) {
      console.error('Error checking Plaid connections:', error);
    }
  };

  // Don't render if no issues or dismissed
  if (!connectionStatus || dismissed) return null;

  const isMissing = connectionStatus.type === 'missing';

  return (
    <div
      className={`plaid-banner ${isMissing ? 'plaid-banner-error' : 'plaid-banner-warning'}`}
      role="alert"
      aria-live="polite"
    >
      <div className="plaid-banner-content">
        <span className="plaid-banner-icon">{isMissing ? '🔌' : '⚠️'}</span>
        <div className="plaid-banner-text">
          <strong>{isMissing ? 'Plaid Not Connected' : 'Sync Issue Detected'}</strong>
          <span>
            {connectionStatus.message}.{' '}
            {isMissing ? (
              <Link to="/accounts">Connect your account</Link>
            ) : (
              <Link to="/accounts">Check connection status</Link>
            )}
          </span>
        </div>
        <button
          className="plaid-banner-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
