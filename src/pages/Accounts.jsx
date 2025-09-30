import React from 'react';
import AccountManager from '../components/AccountManager.jsx';

export default function Accounts() {
  return (
    <div className="accounts-page">
      <section>
        <div className="section-header">
          <h2>Connected Accounts</h2>
          <p className="meta">Manage your Plaid account connections for automatic holdings synchronization.</p>
        </div>
        <AccountManager />
      </section>
    </div>
  );
}