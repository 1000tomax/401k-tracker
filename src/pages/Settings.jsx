import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { usePlaidAuth } from '../contexts/PlaidAuthContext.jsx';

const CLIENT_SHARED_TOKEN =
  (import.meta.env && import.meta.env.VITE_401K_TOKEN) ||
  (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_401K_TOKEN : undefined) ||
  '';

export default function Settings({
  portfolioSettings,
  onUpdateSettings,
  transactions
}) {
  const [localSettings, setLocalSettings] = useState(portfolioSettings);
  const { isAuthenticated, logout } = usePlaidAuth();

  useEffect(() => {
    setLocalSettings(portfolioSettings);
  }, [portfolioSettings]);

  const handleToggleMultiAccount = () => {
    const newSettings = {
      ...localSettings,
      multiAccountMode: !localSettings.multiAccountMode
    };
    setLocalSettings(newSettings);
    onUpdateSettings(newSettings);
  };

  const transactionCount = transactions?.length || 0;
  const oldestTransaction = transactions?.length ? transactions[0]?.date : null;
  const newestTransaction = transactions?.length ? transactions[transactions.length - 1]?.date : null;

  return (
    <div className="settings">
      <div className="section-header">
        <h2>Settings</h2>
        <p className="meta">Configure your portfolio tracking preferences</p>
      </div>

      {/* Data Overview */}
      <section>
        <h3>Data Overview</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <label>Total Transactions</label>
            <div className="setting-value">{transactionCount.toLocaleString()}</div>
          </div>

          {oldestTransaction && (
            <div className="setting-item">
              <label>Oldest Transaction</label>
              <div className="setting-value">{formatDate(oldestTransaction)}</div>
            </div>
          )}

          {newestTransaction && (
            <div className="setting-item">
              <label>Latest Transaction</label>
              <div className="setting-value">{formatDate(newestTransaction)}</div>
            </div>
          )}
        </div>
      </section>

      {/* Account Settings */}
      <section>
        <h3>Account Settings</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={localSettings.multiAccountMode}
                onChange={handleToggleMultiAccount}
              />
              Multi-Account Mode
            </label>
            <div className="setting-description">
              Track multiple retirement accounts (401k, Roth IRA, etc.)
            </div>
          </div>
        </div>
      </section>

      {/* GitHub Integration */}
      {CLIENT_SHARED_TOKEN && (
        <section>
          <h3>GitHub Integration</h3>
          <div className="status-banner status-banner--info">
            GitHub sync is configured and ready to use.
          </div>
        </section>
      )}

      {/* Plaid Integration Status */}
      <section>
        <h3>Plaid Integration</h3>
        {isAuthenticated ? (
          <div className="status-banner status-banner--success">
            <div className="status-content">
              <div className="status-text">
                ✅ Authenticated for account connection. You can now securely link financial accounts.
              </div>
              <button 
                type="button" 
                className="status-action-btn"
                onClick={logout}
              >
                End Session
              </button>
            </div>
          </div>
        ) : (
          <div className="status-banner status-banner--info">
            <div className="status-text">
              🔒 Protected account connection is available. Authentication required to access personal financial features while keeping this portfolio demonstration public.
            </div>
          </div>
        )}
        
        <div className="status-banner status-banner--neutral">
          Plaid integration enables automatic transaction and balance updates from major financial institutions.
        </div>
      </section>
    </div>
  );
}