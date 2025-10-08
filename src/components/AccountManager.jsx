/**
 * @file AccountManager.jsx
 * @description A component for managing Plaid account connections.
 * It allows users to connect new accounts via Plaid Link, view their
 * currently connected accounts, and disconnect them.
 */
import React, { useState, useEffect } from 'react';
import PlaidLink from './PlaidLink.jsx';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

/**
 * The AccountManager component.
 * @returns {React.Component}
 */
const AccountManager = () => {
  // State for storing the list of connected Plaid accounts.
  const [accounts, setAccounts] = useState([]);
  // State to manage the loading status while fetching accounts.
  const [loading, setLoading] = useState(true);
  // State to track which accounts are currently being removed to disable buttons.
  const [removing, setRemoving] = useState(new Set());

  /**
   * Fetches the list of connected Plaid accounts from the server.
   */
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

  /**
   * Handles the successful connection of a new account via Plaid Link.
   * It sends the new connection data to the server to be saved.
   * @param {object} data - The data returned from a successful Plaid Link connection.
   */
  const handlePlaidSuccess = async (data) => {
    console.log('✅ Plaid connection successful!', data);

    try {
      // Save connection to database
      const response = await fetch(`${API_URL}/api/plaid/save-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
        body: JSON.stringify({
          access_token: data.accessToken,
          item_id: data.itemId,
          institution_name: data.institution?.name || 'Unknown Institution',
          institution_id: data.institution?.institution_id,
        }),
      });

      if (response.ok) {
        console.log('✅ Connection saved to database');
        // Refresh the account list
        await fetchAccounts();
      } else {
        const error = await response.json();
        console.error('❌ Failed to save connection:', error);
        alert(`Connection succeeded but failed to save: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error saving connection:', error);
      alert('Connection succeeded but failed to save to database.');
    }
  };

  /**
   * Handles the disconnection of a Plaid account.
   * It prompts the user for confirmation and then sends a request to the server
   * to remove the connection.
   * @param {object} account - The account object to be disconnected.
   */
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