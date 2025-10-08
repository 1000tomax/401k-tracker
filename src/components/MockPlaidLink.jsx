/**
 * @file MockPlaidLink.jsx
 * @description A component that simulates the Plaid Link connection flow for development purposes.
 * It uses a mock service to generate sample data, allowing for testing of the
 * Plaid integration without needing real credentials or hitting Plaid's API.
 */
import React, { useState } from 'react';
import MockPlaidService, { mockConnectionData, mockPlaidData } from '../services/MockPlaidService';

/**
 * The MockPlaidLink component.
 * @param {object} props - The component's props.
 * @param {function} props.onSuccess - Callback function for a successful mock connection.
 * @param {function} props.onError - Callback function for a failed mock connection.
 * @param {boolean} props.disabled - Flag to disable the button.
 * @returns {React.Component}
 */
const MockPlaidLink = ({ onSuccess, onError, disabled = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Handles the mock Plaid connection flow, simulating user interaction and API calls.
   */
  const handleMockConnection = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🎭 MockPlaidLink: Starting mock connection flow');

      // Simulate the Plaid Link UI and user interaction time.
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate the backend token exchange process.
      const linkToken = await MockPlaidService.createLinkToken();
      const tokenData = await MockPlaidService.exchangePublicToken('mock-public-token');
      const accountsData = await MockPlaidService.getAccounts(tokenData.access_token);

      console.log('🎭 MockPlaidLink: Mock connection successful');

      // Pass the mock connection data to the parent component.
      if (onSuccess) {
        onSuccess({
          ...mockConnectionData,
          accessToken: tokenData.access_token,
          itemId: tokenData.item_id,
          accounts: accountsData.accounts
        });
      }

    } catch (err) {
      console.error('❌ MockPlaidLink: Mock connection failed:', err);
      setError('Mock connection failed. Please try again.');
      if (onError) onError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    handleMockConnection();
  };

  if (loading) {
    return (
      <div className="plaid-link-container">
        <button disabled className="plaid-link-button loading">
          <div className="loading-spinner"></div>
          Connecting to Mock Bank...
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plaid-link-container">
        <div className="plaid-error">
          <p>{error}</p>
          <button onClick={handleRetry} className="plaid-retry-button">
            Retry Mock Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="plaid-link-container">
      <button
        onClick={handleMockConnection}
        disabled={disabled || loading}
        className="plaid-link-button mock-button"
        type="button"
      >
        <svg
          className="plaid-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8-1.41-1.42z"/>
        </svg>
        Connect Mock 401k Account (Dev)
      </button>
      <p className="plaid-description mock-description">
        <strong>Dev Mode:</strong> This will simulate connecting to a mock investment account with sample transaction data for testing the debugging interface.
      </p>

      <div className="mock-data-preview">
        <details className="mock-preview-section">
          <summary>Preview Mock Data ({mockPlaidData.investment_transactions.length} transactions)</summary>
          <div className="mock-preview-content">
            <div className="mock-stats">
              <div className="stat">
                <strong>Accounts:</strong> {mockPlaidData.accounts.length} (Voya, Fidelity)
              </div>
              <div className="stat">
                <strong>Securities:</strong> {mockPlaidData.securities.length} (VTSAX, VTIAX, VBTLX, FXAIX)
              </div>
              <div className="stat">
                <strong>Transaction Types:</strong> {[...new Set(mockPlaidData.investment_transactions.map(t => t.type))].join(', ')}
              </div>
              <div className="stat">
                <strong>Date Range:</strong> {mockPlaidData.date_range.start_date} to {mockPlaidData.date_range.end_date}
              </div>
            </div>
          </div>
        </details>
      </div>

      <style jsx>{`
        .plaid-link-button.mock-button {
          background: linear-gradient(45deg, #4CAF50, #45a049);
          border: 2px solid #4CAF50;
        }

        .plaid-link-button.mock-button:hover {
          background: linear-gradient(45deg, #45a049, #4CAF50);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
        }

        .mock-data-preview {
          margin-top: 16px;
          padding: 12px;
          background: #1f2937;
          border-radius: 6px;
          border: 1px solid #374151;
        }

        .mock-preview-section {
          margin: 0;
        }

        .mock-preview-section summary {
          cursor: pointer;
          font-weight: 500;
          color: #f3f4f6;
          padding: 4px 0;
          transition: color 0.2s;
        }

        .mock-preview-section summary:hover {
          color: #60a5fa;
        }

        .mock-preview-content {
          margin-top: 12px;
        }

        .mock-stats {
          display: grid;
          gap: 8px;
        }

        .mock-stats .stat {
          padding: 8px 12px;
          background: #111827;
          border-radius: 4px;
          border: 1px solid #374151;
          font-size: 14px;
          color: #e5e7eb;
        }

        .mock-stats .stat strong {
          color: #f3f4f6;
          font-weight: 600;
        }

        .mock-description {
          color: #d1d5db !important;
          font-size: 14px;
          margin-top: 8px;
        }

        .mock-description strong {
          color: #f3f4f6;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default MockPlaidLink;