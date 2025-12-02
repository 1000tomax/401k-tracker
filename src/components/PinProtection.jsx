import React, { useState } from 'react';

const EXPECTED_PIN = import.meta.env.VITE_PLAID_ACCESS_PASSWORD;

const PinProtection = ({ 
  children, 
  onSuccess, 
  actionName = "this action",
  description = "This is a dangerous operation that requires verification."
}) => {
  const [pin, setPin] = useState('');
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!pin.trim()) {
      setError('Please enter the access PIN');
      setIsLoading(false);
      return;
    }

    if (pin === EXPECTED_PIN) {
      setPin('');
      setShowPinPrompt(false);
      setError('');
      setIsLoading(false);
      if (onSuccess) {
        onSuccess();
      }
    } else {
      setError('Invalid PIN. Please try again.');
      setPin('');
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setPin('');
    setShowPinPrompt(false);
    setError('');
  };

  const handleRequestAccess = () => {
    setShowPinPrompt(true);
    setError('');
  };

  if (showPinPrompt) {
    return (
      <div className="pin-protection-overlay">
        <div className="pin-protection-modal">
          <div className="pin-protection-header">
            <h3>Access PIN Required</h3>
            <p>{description}</p>
            <p>Please enter your access PIN to {actionName}.</p>
          </div>

          <form onSubmit={handlePinSubmit} className="pin-protection-form">
            <div className="form-group">
              <label htmlFor="access-pin">Access PIN</label>
              <input
                id="access-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter access PIN"
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="pin-protection-error">
                {error}
              </div>
            )}

            <div className="pin-protection-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!pin.trim() || isLoading}
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Render the protected content with click handler
  return React.cloneElement(children, {
    onClick: handleRequestAccess
  });
};

export default PinProtection;