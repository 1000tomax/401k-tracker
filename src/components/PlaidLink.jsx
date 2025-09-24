import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import PlaidService from '../services/PlaidService';

const PlaidLink = ({ onSuccess, onError, disabled = false }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Create link token on component mount
  useEffect(() => {
    const initializePlaidLink = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await PlaidService.createLinkToken();
        setLinkToken(token);
      } catch (err) {
        console.error('Failed to initialize Plaid Link:', err);
        setError('Failed to initialize account connection. Please try again.');
        if (onError) onError(err);
      } finally {
        setLoading(false);
      }
    };

    initializePlaidLink();
  }, [onError]);

  const handleOnSuccess = useCallback(
    async (publicToken, metadata) => {
      try {
        setLoading(true);
        console.log('Plaid Link success:', { publicToken, metadata });

        // Exchange public token for access token
        const tokenData = await PlaidService.exchangePublicToken(publicToken);
        
        // Get account information
        const accountsData = await PlaidService.getAccounts(tokenData.access_token);
        
        // Call parent success handler with all data
        if (onSuccess) {
          onSuccess({
            accessToken: tokenData.access_token,
            itemId: tokenData.item_id,
            accounts: accountsData.accounts,
            institution: metadata.institution,
            linkSessionId: metadata.link_session_id,
          });
        }
      } catch (err) {
        console.error('Error handling Plaid success:', err);
        setError('Failed to connect account. Please try again.');
        if (onError) onError(err);
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError]
  );

  const handleOnExit = useCallback((err, metadata) => {
    console.log('Plaid Link exit:', { err, metadata });
    if (err) {
      console.error('Plaid Link error:', err);
      setError('Account connection was cancelled or failed.');
    }
  }, []);

  const config = {
    token: linkToken,
    onSuccess: handleOnSuccess,
    onExit: handleOnExit,
  };

  const { open, ready } = usePlaidLink(config);

  const handleClick = () => {
    if (ready) {
      open();
    }
  };

  if (loading) {
    return (
      <div className="plaid-link-container">
        <button disabled className="plaid-link-button loading">
          <div className="loading-spinner"></div>
          Initializing...
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plaid-link-container">
        <div className="plaid-error">
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="plaid-retry-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="plaid-link-container">
      <button
        onClick={handleClick}
        disabled={!ready || disabled || loading}
        className="plaid-link-button"
        type="button"
      >
        {!ready ? (
          <>
            <div className="loading-spinner"></div>
            Loading...
          </>
        ) : (
          <>
            <svg
              className="plaid-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8-1.41-1.42z"/>
            </svg>
            Connect Your 401k Account
          </>
        )}
      </button>
      <p className="plaid-description">
        Securely connect your 401k or investment account to automatically import transactions and holdings.
      </p>
    </div>
  );
};

export default PlaidLink;