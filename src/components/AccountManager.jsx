import React, { useState, useEffect } from 'react';
import PlaidLink from './PlaidLink.jsx';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

const AccountManager = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(new Set());

  // Fetch connected accounts from database
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/plaid/connections`, {
        headers: {
          'X-401K-Token': API_TOKEN,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAccounts(data.connections || []);
      } else {
        console.error('Failed to fetch connections');
      }
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handlePlaidSuccess = async () => {
    console.log('✅ Plaid connection successful! Refreshing account list...');
    // Refresh the account list after successful connection
    await fetchAccounts();
  };

  const handleDisconnectAccount = async (account) => {
    if (!account.access_token && !account.item_id) {
      console.error('No access token or item_id available');
      return;
    }

    const accountKey = account.item_id || account.access_token;
    if (removing.has(accountKey)) return;

    const institutionName = account.institution_name || 'this account';
    if (!window.confirm(`Are you sure you want to disconnect ${institutionName}?\n\nThis will stop automatic syncing. You can reconnect later if needed.`)) {
      return;
    }

    setRemoving(prev => new Set(prev).add(accountKey));

    try {
      const response = await fetch(`${API_URL}/api/plaid/remove-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
        body: JSON.stringify({
          item_id: account.item_id,
        }),
      });

      if (response.ok) {
        console.log('✅ Account disconnected');
        // Refresh the list
        await fetchAccounts();
      } else {
        const error = await response.json();
        console.error('❌ Failed to disconnect:', error);
        alert(`Failed to disconnect: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
      alert('Failed to disconnect account. Please try again.');
    } finally {
      setRemoving(prev => {
        const newSet = new Set(prev);
        newSet.delete(accountKey);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="account-manager">
        <p className="meta">Loading connected accounts...</p>
      </div>
    );
  }

  return (
    <div className="account-manager">
      {accounts.length === 0 ? (
        <div className="empty-state">
          <p className="meta">No accounts connected yet.</p>
          <p className="demo-description">
            Connect your 401k and investment accounts via Plaid for automatic holdings synchronization.
          </p>
          <div className="empty-state-actions">
            <PlaidLink onSuccess={handlePlaidSuccess} />
          </div>
        </div>
      ) : (
        <>
          <div className="connected-accounts-list">
            {accounts.map((account) => {
              const accountKey = account.item_id || account.id;
              const isRemoving = removing.has(accountKey);

              return (
                <div key={accountKey} className="connected-account-card">
                  <div className="account-header">
                    <div>
                      <h4>{account.institution_name || 'Unknown Institution'}</h4>
                      <p className="meta">
                        Connected {account.created_at ? new Date(account.created_at).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary small warning"
                      onClick={() => handleDisconnectAccount(account)}
                      disabled={isRemoving}
                    >
                      {isRemoving ? 'Removing...' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="account-manager-footer">
            <PlaidLink onSuccess={handlePlaidSuccess} buttonText="Add Another Account" />
          </div>
        </>
      )}
    </div>
  );
};

export default AccountManager;