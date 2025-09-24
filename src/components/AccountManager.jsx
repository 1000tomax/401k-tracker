import React, { useState, useEffect } from 'react';
import PlaidService from '../services/PlaidService';

const AccountManager = ({ connectedAccounts = [], onAccountRemoved }) => {
  const [removing, setRemoving] = useState(new Set());
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    // In a real app, you'd fetch connected accounts from your backend
    // For now, we'll use the prop or mock some data
    setAccounts(connectedAccounts);
  }, [connectedAccounts]);

  const handleDisconnectAccount = async (account) => {
    if (!account.access_token) {
      console.error('No access token available for account:', account);
      return;
    }

    const accountKey = account.item_id || account.access_token;
    if (removing.has(accountKey)) return; // Prevent double-click

    setRemoving(prev => new Set(prev).add(accountKey));

    try {
      const response = await fetch('/api/plaid/removeItem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: account.access_token,
          reason: 'user_requested'
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Account disconnected:', result);

        // Remove from local state
        setAccounts(prev => prev.filter(acc =>
          (acc.item_id || acc.access_token) !== accountKey
        ));

        // Notify parent component
        if (onAccountRemoved) {
          onAccountRemoved(account);
        }

        alert(`Successfully disconnected account: ${account.institution?.name || 'Unknown Institution'}`);
      } else {
        const error = await response.json();
        console.error('❌ Failed to disconnect account:', error);
        alert(`Failed to disconnect account: ${error.error_message || error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error disconnecting account:', error);
      alert('Failed to disconnect account. Please try again.');
    } finally {
      setRemoving(prev => {
        const newSet = new Set(prev);
        newSet.delete(accountKey);
        return newSet;
      });
    }
  };

  const confirmDisconnect = (account) => {
    const institutionName = account.institution?.name || account.account_name || 'Unknown Institution';
    const message = `Are you sure you want to disconnect "${institutionName}"?\n\nThis will:\n• Remove access to account data\n• Stop automatic transaction updates\n• Permanently delete the connection\n\nYou can reconnect later if needed.`;

    if (window.confirm(message)) {
      handleDisconnectAccount(account);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="account-manager">
        <h3>Connected Accounts</h3>
        <p className="meta">No accounts connected yet.</p>
        <div className="empty-state-actions">
          <a href="/import" className="import-link">🔗 Connect Your First Account</a>
        </div>
      </div>
    );
  }

  return (
    <div className="account-manager">
      <h3>Connected Accounts</h3>
      <p className="meta">Manage your connected investment and 401k accounts.</p>

      <div className="connected-accounts-list">
        {accounts.map((account, index) => {
          const accountKey = account.item_id || account.access_token || index;
          const isRemoving = removing.has(accountKey);
          const institutionName = account.institution?.name || account.account_name || 'Unknown Institution';
          const accountCount = account.accounts?.length || 0;

          return (
            <div key={accountKey} className="connected-account-item">
              <div className="account-info">
                <div className="account-details">
                  <h4>{institutionName}</h4>
                  <p className="meta">
                    {accountCount > 0 ? `${accountCount} account${accountCount === 1 ? '' : 's'}` : 'Connected'}
                    {account.last_sync && ` • Last sync: ${new Date(account.last_sync).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="account-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => confirmDisconnect(account)}
                    disabled={isRemoving}
                  >
                    {isRemoving ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              </div>

              {account.accounts && account.accounts.length > 0 && (
                <div className="account-breakdown">
                  {account.accounts.slice(0, 3).map((acc, idx) => (
                    <div key={idx} className="sub-account">
                      <span className="account-name">{acc.name}</span>
                      <span className="account-type">{acc.subtype || acc.type}</span>
                      {acc.balances?.current && (
                        <span className="account-balance">
                          ${acc.balances.current.toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
                  {account.accounts.length > 3 && (
                    <div className="sub-account">
                      <span className="meta">+{account.accounts.length - 3} more accounts</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="account-manager-footer">
        <p className="meta">
          Need help? Disconnected accounts can be reconnected at any time.
        </p>
        <a href="/import" className="secondary">Add Another Account</a>
      </div>
    </div>
  );
};

export default AccountManager;