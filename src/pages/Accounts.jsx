import React, { useState } from 'react';
import AccountManager from '../components/AccountManager.jsx';
import VoyaPasteImport from '../components/VoyaPasteImport.jsx';

export default function Accounts() {
  const [voyaData, setVoyaData] = useState(null);
  const [showWebForm, setShowWebForm] = useState(false);

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
          <p className="section-description">Import your Voya retirement account transactions.</p>

          {/* MCP Import (Preferred) */}
          <div style={{
            padding: '20px',
            backgroundColor: '#1a1d24',
            border: '2px solid #10b981',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🚀</span>
              <span>Preferred: Import via Claude Code</span>
            </h4>
            <p style={{ margin: '0 0 12px 0', color: '#d1d5db', fontSize: '14px' }}>
              Use the custom MCP server for faster, more convenient imports from any device (desktop or mobile).
            </p>
            <div style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.6' }}>
              <p style={{ margin: '8px 0' }}>
                <strong>In Claude Code or Claude Chat:</strong>
              </p>
              <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>Copy transaction data from <a href="https://my.voya.com" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>my.voya.com</a></li>
                <li>Type <code style={{ padding: '2px 6px', backgroundColor: '#2d3748', borderRadius: '4px', color: '#10b981' }}>/import-voya</code> and paste the data</li>
                <li>Confirm to import</li>
              </ol>
              <p style={{ margin: '12px 0 0 0' }}>
                <a
                  href="https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-server-quickstart"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#10b981', textDecoration: 'underline' }}
                >
                  📖 Setup Guide: How to configure the MCP server
                </a>
              </p>
            </div>
          </div>

          {/* Web Form (Fallback) */}
          <div>
            <button
              onClick={() => setShowWebForm(!showWebForm)}
              style={{
                padding: '10px 16px',
                backgroundColor: '#374151',
                color: '#d1d5db',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>{showWebForm ? '▼' : '▶'}</span>
              <span>Alternative: Use Web Form</span>
            </button>

            {showWebForm && (
              <div style={{ marginTop: '16px' }}>
                <VoyaPasteImport
                  onImportSuccess={handleVoyaImportSuccess}
                  onImportError={handleVoyaImportError}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}