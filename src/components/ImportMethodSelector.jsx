/**
 * @file ImportMethodSelector.jsx
 * @description A component that provides options for importing data, primarily through
 * connecting a financial account via Plaid. It includes a development mode that allows
 * for using mock Plaid data for testing purposes.
 */
import React, { useState } from 'react';
import PlaidLink from './PlaidLink';
import MockPlaidLink from './MockPlaidLink';
import PlaidAuth from './PlaidAuth';
import { usePlaidAuth } from '../contexts/PlaidAuthContext.jsx';

/**
 * The ImportMethodSelector component.
 * @param {object} props - The component's props.
 * @param {function} props.onMethodSelect - Callback function for when a method is selected (currently unused).
 * @param {function} props.onPlaidSuccess - Callback function for when a Plaid connection is successful.
 * @returns {React.Component}
 */
const ImportMethodSelector = ({ onMethodSelect, onPlaidSuccess }) => {
  const { isAuthenticated, isLoading } = usePlaidAuth();
  const isDevelopment = import.meta.env.DEV;

  /**
   * Handles a successful Plaid connection by logging it and calling the parent's success handler.
   * @param {object} plaidData - The data returned from a successful Plaid connection.
   */
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
          <div className="import-method-title">
            🔗 Connect Account {isDevelopment && '(Dev Mode)'}
          </div>
          <p className="import-method-description">
            {isDevelopment
              ? 'Development mode: Choose between real Plaid connection or mock data for testing'
              : 'Securely connect your 401k or investment account for automatic transaction imports'
            }
          </p>
          <div style={{ marginTop: '1rem' }}>
            {isDevelopment ? (
              <div className="dev-mode-options">
                <div className="dev-option">
                  <MockPlaidLink
                    onSuccess={handlePlaidSuccess}
                    onError={handlePlaidError}
                  />
                </div>
                <div className="dev-option">
                  <div className="real-plaid-section">
                    <h4>Real Plaid Connection (Requires Auth)</h4>
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
            ) : (
              // Production mode - only one PlaidLink instance
              isAuthenticated ? (
                <PlaidLink
                  onSuccess={handlePlaidSuccess}
                  onError={handlePlaidError}
                />
              ) : (
                <PlaidAuth onAuthenticated={() => {/* PlaidLink will show automatically when authenticated */}} />
              )
            )}
          </div>
        </div>
      </div>

      {isDevelopment && (
        <style jsx>{`
          .dev-mode-options {
            display: grid;
            gap: 20px;
          }

          .dev-option {
            padding: 16px;
            border: 1px solid #374151;
            border-radius: 8px;
            background: #1f2937;
            color: #f9fafb;
          }

          .real-plaid-section h4 {
            margin: 0 0 12px 0;
            color: #f3f4f6;
            font-size: 16px;
            font-weight: 600;
          }

          .dev-option p,
          .dev-option span,
          .dev-option div {
            color: #e5e7eb;
          }

          .dev-option .import-method-description {
            color: #d1d5db;
            margin-bottom: 1rem;
          }

          .dev-option button {
            background: #2563eb;
            color: white;
            border: 2px solid #1d4ed8;
            border-radius: 6px;
            padding: 8px 16px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
          }

          .dev-option button:hover {
            background: #1d4ed8;
            border-color: #1e40af;
            transform: translateY(-1px);
          }

          .dev-option button:disabled {
            background: #6b7280;
            border-color: #4b5563;
            cursor: not-allowed;
            transform: none;
          }
        `}</style>
      )}
    </div>
  );
};

export default ImportMethodSelector;