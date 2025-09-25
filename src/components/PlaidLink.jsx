import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import PlaidService from '../services/PlaidService';

// Global singleton pattern to prevent multiple instances from creating tokens
let globalLinkToken = null;
let globalInitializationInProgress = false;
let globalInitializationPromise = null;

const PlaidLink = ({ onSuccess, onError, disabled = false }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initializingRef = useRef(false); // Prevent multiple simultaneous calls
  const initializedRef = useRef(false); // Track if we've ever initialized

  useEffect(() => {
    const initializePlaidLink = async () => {
      // Use global token if already available
      if (globalLinkToken) {
        console.log('🔄 Using existing global link token');
        setLinkToken(globalLinkToken);
        return;
      }

      // If another instance is already initializing, wait for it
      if (globalInitializationInProgress && globalInitializationPromise) {
        console.log('⏳ Waiting for existing initialization to complete');
        try {
          const token = await globalInitializationPromise;
          setLinkToken(token);
          return;
        } catch (err) {
          console.error('Global initialization failed:', err);
        }
      }

      // Multiple guards to prevent infinite loops
      if (linkToken || initializingRef.current || initializedRef.current || globalInitializationInProgress) {
        console.log('🛑 Skipping Link token creation:', {
          hasToken: !!linkToken,
          isInitializing: initializingRef.current,
          wasInitialized: initializedRef.current,
          globalInProgress: globalInitializationInProgress
        });
        return;
      }

      try {
        initializingRef.current = true;
        globalInitializationInProgress = true;
        setLoading(true);
        setError(null);
        console.log('🔗 Creating Plaid Link token (global singleton)...');

        // Create the promise for other instances to wait for
        globalInitializationPromise = PlaidService.createLinkToken();
        const token = await globalInitializationPromise;

        // Store globally and locally
        globalLinkToken = token;
        setLinkToken(token);
        initializedRef.current = true;
        console.log('✅ Plaid Link token created successfully (global singleton)');
      } catch (err) {
        console.error('Failed to initialize Plaid Link:', err);
        globalLinkToken = null; // Clear on error
        globalInitializationPromise = null;
        setError('Failed to initialize account connection. Please try again.');
        if (onError) onError(err);
      } finally {
        setLoading(false);
        initializingRef.current = false;
        globalInitializationInProgress = false;
      }
    };

    initializePlaidLink();
  }, []); // Empty dependencies to run only once

  const handleOnSuccess = useCallback(
    async (public_token, metadata) => {
      try {
        setLoading(true);

        // Debug the callback structure
        console.log('Plaid Link success - Raw callback args:', { public_token, metadata });
        console.log('Plaid Link success - First arg:', public_token);
        console.log('Plaid Link success - Second arg:', metadata);

        // Handle both possible callback formats
        let actualPublicToken;
        let actualMetadata;

        if (typeof public_token === 'object' && public_token.public_token) {
          // New SDK format: single object with properties
          actualPublicToken = public_token.public_token;
          actualMetadata = public_token.metadata || public_token;
        } else {
          // Old SDK format: separate parameters
          actualPublicToken = public_token;
          actualMetadata = metadata;
        }

        console.log('Plaid Link success - Processed:', {
          actualPublicToken: actualPublicToken?.substring(0, 20) + '...' || 'undefined',
          hasPublicToken: !!actualPublicToken,
          publicTokenType: typeof actualPublicToken,
          actualMetadata
        });

        if (!actualPublicToken) {
          throw new Error('No public token received from Plaid Link');
        }

        // Exchange public token for access token
        const tokenData = await PlaidService.exchangePublicToken(actualPublicToken);
        
        // Get account information
        const accountsData = await PlaidService.getAccounts(tokenData.access_token);
        
        // Call parent success handler with all data
        if (onSuccess) {
          onSuccess({
            accessToken: tokenData.access_token,
            itemId: tokenData.item_id,
            accounts: accountsData.accounts,
            institution: actualMetadata.institution,
            linkSessionId: actualMetadata.link_session_id,
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