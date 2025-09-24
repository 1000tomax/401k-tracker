import React, { useState } from 'react';
import PlaidLink from './PlaidLink';
import PlaidAuth from './PlaidAuth';
import { usePlaidAuth } from '../contexts/PlaidAuthContext.jsx';

const ImportMethodSelector = ({ onMethodSelect, onPlaidSuccess }) => {
  const { isAuthenticated, isLoading } = usePlaidAuth();

  const handlePlaidSuccess = (plaidData) => {
    console.log('Plaid connection successful:', plaidData);
    if (onPlaidSuccess) {
      onPlaidSuccess(plaidData);
    }
  };

  const handlePlaidError = (error) => {
    console.error('Plaid connection error:', error);
    // You could add error handling UI here
  };

  return (
    <div className="import-method-selector">
      <h3>Connect Your Accounts</h3>
      <p className="meta">
        Securely connect your 401k and investment accounts for automatic transaction imports and real-time portfolio tracking.
      </p>
      
      <div className="import-methods">
        <div className="import-method-card selected">
          <div className="import-method-title">🔗 Connect Account</div>
          <p className="import-method-description">
            Securely connect your 401k or investment account for automatic transaction imports
          </p>
          <div style={{ marginTop: '1rem' }}>
            {isAuthenticated ? (
              <PlaidLink 
                onSuccess={handlePlaidSuccess}
                onError={handlePlaidError}
              />
            ) : (
              <PlaidAuth onAuthenticated={() => {/* PlaidLink will show automatically when authenticated */}} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportMethodSelector;