import React, { useState } from 'react';
import AccountManager from '../components/AccountManager.jsx';
import VoyaPasteImport from '../components/VoyaPasteImport.jsx';

export default function Accounts() {
  const [voyaData, setVoyaData] = useState(null);

  const handleVoyaImportSuccess = (snapshot) => {
    console.log('✅ Voya snapshot imported successfully:', snapshot);
    setVoyaData(snapshot);
  };

  const handleVoyaImportError = (error) => {
    console.error('❌ Voya import error:', error);
  };

  return (
    <div className="accounts-page">
      <section>
        <div className="section-header">
          <h2>Connected Accounts</h2>
          <p className="meta">Manage your account connections for automatic holdings synchronization.</p>
        </div>

        {/* Plaid Accounts */}
        <div className="account-section">
          <h3>Plaid Accounts</h3>
          <p className="section-description">Connect brokerage accounts via Plaid for automatic daily synchronization.</p>
          <AccountManager />
        </div>

        {/* Voya 401(k) */}
        <div className="account-section" style={{ marginTop: '40px' }}>
          <h3>Voya 401(k)</h3>
          <p className="section-description">Import your Voya retirement account balance by copy-pasting data from the Voya website.</p>
          <VoyaPasteImport
            onImportSuccess={handleVoyaImportSuccess}
            onImportError={handleVoyaImportError}
          />
        </div>
      </section>
    </div>
  );
}