/**
 * @file PlaidAuth.jsx
 * @description A component that handles the authentication flow required to use the
 * real Plaid Link component. It prompts for a password and uses the PlaidAuthContext
 * to manage the authentication state.
 */
import React, { useState } from 'react';
import { usePlaidAuth } from '../contexts/PlaidAuthContext.jsx';

/**
 * The PlaidAuth component.
 * @param {object} props - The component's props.
 * @param {function} props.onAuthenticated - A callback function that is called when the user successfully authenticates.
 * @returns {React.Component}
 */
const PlaidAuth = ({ onAuthenticated }) => {
  const { isAuthenticated, login, logout } = usePlaidAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handles the form submission for authentication.
   * It calls the login function from the context and handles success or failure.
   * @param {React.FormEvent} e - The form submission event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setError('');

    // Add a small delay to prevent brute force attempts
    await new Promise(resolve => setTimeout(resolve, 500));

    const success = login(password);
    
    if (success) {
      setPassword('');
      if (onAuthenticated) {
        onAuthenticated();
      }
    } else {
      setError('Invalid password. Please try again.');
    }
    
    setIsLoading(false);
  };

  const handleLogout = () => {
    logout();
    setPassword('');
    setError('');
  };

  if (isAuthenticated) {
    return (
      <div className="plaid-auth-status">
        <div className="auth-success">
          <span className="auth-icon">🔓</span>
          <div className="auth-content">
            <div className="auth-title">Authenticated for Account Connection</div>
            <p className="auth-description">You can now connect your financial accounts securely.</p>
            <button 
              type="button" 
              className="auth-logout-btn" 
              onClick={handleLogout}
            >
              End Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plaid-auth">
      <div className="auth-container">
        <div className="auth-header">
          <span className="auth-icon">🔒</span>
          <div className="auth-title">Authentication Required</div>
        </div>
        
        <p className="auth-description">
          Account connection features are protected for privacy. This is a personal portfolio project showcasing financial tracking capabilities.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="plaid-password">Access Password</label>
            <input
              id="plaid-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to connect accounts"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="auth-error">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="auth-submit-btn"
            disabled={!password.trim() || isLoading}
          >
            {isLoading ? 'Authenticating...' : 'Authenticate'}
          </button>
        </form>

        <div className="auth-notice">
          <p className="notice-text">
            <strong>Visitors:</strong> This section demonstrates Plaid integration for automatic account connectivity. The manual import feature above is fully functional for exploring the portfolio tracking capabilities.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlaidAuth;