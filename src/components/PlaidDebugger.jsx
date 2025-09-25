import React, { useState } from 'react';

const PlaidDebugger = ({ plaidData, convertedTransactions, onToggle, isVisible = false }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedTransaction, setExpandedTransaction] = useState(null);
  const [expandedSecurity, setExpandedSecurity] = useState(null);
  const [expandedAccount, setExpandedAccount] = useState(null);

  if (!plaidData) {
    return (
      <div className="plaid-debugger">
        <button
          className="debug-toggle"
          onClick={onToggle}
          title="Toggle Plaid Debug Panel"
        >
          🐛 Debug Panel
        </button>
        {isVisible && (
          <div className="debug-panel">
            <div className="debug-header">
              <h3>Plaid Debug Panel</h3>
              <button className="close-debug" onClick={onToggle}>×</button>
            </div>
            <p className="debug-message">No Plaid data available. Connect an account to see debug information.</p>
          </div>
        )}
      </div>
    );
  }

  const {
    investment_transactions = [],
    securities = [],
    accounts = [],
    total_investment_transactions = 0,
    date_range = {}
  } = plaidData;

  return (
    <div className="plaid-debugger">
      <button
        className="debug-toggle"
        onClick={onToggle}
        title="Toggle Plaid Debug Panel"
      >
        🐛 Debug Panel ({investment_transactions.length} txns)
      </button>

      {isVisible && (
        <div className="debug-panel">
          <div className="debug-header">
            <h3>Plaid Debug Panel</h3>
            <button className="close-debug" onClick={onToggle}>×</button>
          </div>

          <div className="debug-tabs">
            <button
              className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transactions')}
            >
              Raw Transactions ({investment_transactions.length})
            </button>
            <button
              className={`tab ${activeTab === 'converted' ? 'active' : ''}`}
              onClick={() => setActiveTab('converted')}
            >
              Converted ({convertedTransactions?.length || 0})
            </button>
            <button
              className={`tab ${activeTab === 'securities' ? 'active' : ''}`}
              onClick={() => setActiveTab('securities')}
            >
              Securities ({securities.length})
            </button>
            <button
              className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => setActiveTab('accounts')}
            >
              Accounts ({accounts.length})
            </button>
          </div>

          <div className="debug-content">
            {activeTab === 'overview' && (
              <div className="debug-overview">
                <div className="debug-stats">
                  <div className="stat">
                    <label>Date Range:</label>
                    <span>{date_range.start_date} to {date_range.end_date}</span>
                  </div>
                  <div className="stat">
                    <label>Total Investment Transactions:</label>
                    <span>{total_investment_transactions}</span>
                  </div>
                  <div className="stat">
                    <label>Retrieved Transactions:</label>
                    <span>{investment_transactions.length}</span>
                  </div>
                  <div className="stat">
                    <label>Converted Transactions:</label>
                    <span>{convertedTransactions?.length || 0}</span>
                  </div>
                  <div className="stat">
                    <label>Securities Found:</label>
                    <span>{securities.length}</span>
                  </div>
                  <div className="stat">
                    <label>Accounts Connected:</label>
                    <span>{accounts.length}</span>
                  </div>
                </div>

                {investment_transactions.length > 0 && (
                  <div className="debug-sample">
                    <h4>Sample Transaction Types</h4>
                    <div className="transaction-types">
                      {[...new Set(investment_transactions.map(t => t.type))].map(type => (
                        <span key={type} className="transaction-type-tag">
                          {type} ({investment_transactions.filter(t => t.type === type).length})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="debug-transactions">
                <div className="debug-scroll">
                  {investment_transactions.map((transaction, index) => (
                    <div key={transaction.investment_transaction_id || index} className="debug-item">
                      <div
                        className="debug-item-header"
                        onClick={() => setExpandedTransaction(
                          expandedTransaction === index ? null : index
                        )}
                      >
                        <span className="transaction-summary">
                          {transaction.date} - {transaction.type} - {transaction.security_name || 'Unknown'}
                          {transaction.amount && ` - $${Math.abs(transaction.amount)}`}
                        </span>
                        <span className="expand-icon">
                          {expandedTransaction === index ? '−' : '+'}
                        </span>
                      </div>
                      {expandedTransaction === index && (
                        <div className="debug-item-details">
                          <pre>{JSON.stringify(transaction, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                  {investment_transactions.length === 0 && (
                    <p className="debug-message">No investment transactions found.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'converted' && (
              <div className="debug-converted">
                <div className="debug-scroll">
                  {convertedTransactions && convertedTransactions.map((transaction, index) => (
                    <div key={index} className="debug-item">
                      <div className="conversion-comparison">
                        <div className="converted-data">
                          <h5>Converted Format:</h5>
                          <ul>
                            <li><strong>Date:</strong> {transaction.date}</li>
                            <li><strong>Fund:</strong> {transaction.fund}</li>
                            <li><strong>Source:</strong> {transaction.moneySource}</li>
                            <li><strong>Activity:</strong> {transaction.activity}</li>
                            <li><strong>Units:</strong> {transaction.units}</li>
                            <li><strong>Unit Price:</strong> ${transaction.unitPrice}</li>
                            <li><strong>Amount:</strong> ${transaction.amount}</li>
                          </ul>
                          {transaction.plaidTransactionId && (
                            <p className="debug-meta">
                              <small>Original ID: {transaction.plaidTransactionId}</small>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!convertedTransactions || convertedTransactions.length === 0) && (
                    <p className="debug-message">No converted transactions available.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'securities' && (
              <div className="debug-securities">
                <div className="debug-scroll">
                  {securities.map((security, index) => (
                    <div key={security.security_id || index} className="debug-item">
                      <div
                        className="debug-item-header"
                        onClick={() => setExpandedSecurity(
                          expandedSecurity === index ? null : index
                        )}
                      >
                        <span className="security-summary">
                          {security.name} {security.ticker_symbol && `(${security.ticker_symbol})`}
                          <span className="security-type">{security.type}</span>
                        </span>
                        <span className="expand-icon">
                          {expandedSecurity === index ? '−' : '+'}
                        </span>
                      </div>
                      {expandedSecurity === index && (
                        <div className="debug-item-details">
                          <pre>{JSON.stringify(security, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                  {securities.length === 0 && (
                    <p className="debug-message">No securities found.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'accounts' && (
              <div className="debug-accounts">
                <div className="debug-scroll">
                  {accounts.map((account, index) => (
                    <div key={account.account_id || index} className="debug-item">
                      <div
                        className="debug-item-header"
                        onClick={() => setExpandedAccount(
                          expandedAccount === index ? null : index
                        )}
                      >
                        <span className="account-summary">
                          {account.name} - {account.type} ({account.subtype})
                          {account.balances?.current && ` - $${account.balances.current.toLocaleString()}`}
                        </span>
                        <span className="expand-icon">
                          {expandedAccount === index ? '−' : '+'}
                        </span>
                      </div>
                      {expandedAccount === index && (
                        <div className="debug-item-details">
                          <pre>{JSON.stringify(account, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <p className="debug-message">No accounts found.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .plaid-debugger {
          position: relative;
          margin: 1rem 0;
        }

        .debug-toggle {
          background: #2563eb;
          border: 2px solid #1d4ed8;
          border-radius: 6px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
          color: white;
          font-weight: 500;
          transition: all 0.2s;
        }

        .debug-toggle:hover {
          background: #1d4ed8;
          border-color: #1e40af;
          transform: translateY(-1px);
        }

        .debug-panel {
          position: absolute;
          top: 40px;
          left: 0;
          right: 0;
          background: #1f2937;
          border: 2px solid #374151;
          border-radius: 8px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          z-index: 1000;
          max-height: 70vh;
          overflow: hidden;
          color: #f9fafb;
        }

        .debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #111827;
          border-bottom: 1px solid #374151;
        }

        .debug-header h3 {
          margin: 0;
          font-size: 16px;
          color: #f9fafb;
          font-weight: 600;
        }

        .close-debug {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
          color: #9ca3af;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .close-debug:hover {
          color: #f9fafb;
          background: #374151;
        }

        .debug-tabs {
          display: flex;
          background: #111827;
          border-bottom: 1px solid #374151;
          overflow-x: auto;
        }

        .tab {
          background: none;
          border: none;
          padding: 12px 16px;
          cursor: pointer;
          font-size: 13px;
          color: #9ca3af;
          border-bottom: 2px solid transparent;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .tab:hover {
          background: #1f2937;
          color: #d1d5db;
        }

        .tab.active {
          color: #60a5fa;
          border-bottom-color: #60a5fa;
          background: #1f2937;
        }

        .debug-content {
          max-height: 50vh;
          overflow-y: auto;
          padding: 16px;
          background: #1f2937;
        }

        .debug-scroll {
          max-height: 40vh;
          overflow-y: auto;
        }

        .debug-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .stat {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background: #111827;
          border: 1px solid #374151;
          border-radius: 6px;
        }

        .stat label {
          font-weight: 600;
          color: #d1d5db;
        }

        .stat span {
          color: #60a5fa;
          font-weight: 500;
        }

        .debug-item {
          margin-bottom: 8px;
          border: 1px solid #374151;
          border-radius: 6px;
          background: #111827;
        }

        .debug-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          cursor: pointer;
          background: #111827;
          transition: background 0.2s;
        }

        .debug-item-header:hover {
          background: #1f2937;
        }

        .transaction-summary,
        .security-summary,
        .account-summary {
          color: #f3f4f6;
          font-size: 14px;
        }

        .debug-item-details {
          padding: 12px;
          background: #1f2937;
          border-top: 1px solid #374151;
        }

        .debug-item-details pre {
          font-size: 11px;
          font-family: 'SF Mono', Monaco, monospace;
          margin: 0;
          max-height: 300px;
          overflow: auto;
          background: #111827;
          color: #e5e7eb;
          padding: 12px;
          border-radius: 4px;
          border: 1px solid #374151;
        }

        .transaction-types {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .transaction-type-tag {
          background: #1e40af;
          color: #dbeafe;
          padding: 6px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .security-type {
          margin-left: 8px;
          font-size: 12px;
          color: #9ca3af;
          background: #374151;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .debug-message {
          color: #9ca3af;
          font-style: italic;
          text-align: center;
          padding: 40px 20px;
        }

        .conversion-comparison {
          display: grid;
          gap: 16px;
        }

        .converted-data h5 {
          color: #f3f4f6;
          margin: 0 0 8px 0;
          font-size: 14px;
        }

        .converted-data ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .converted-data li {
          padding: 6px 0;
          border-bottom: 1px solid #374151;
          color: #e5e7eb;
          font-size: 13px;
        }

        .converted-data li strong {
          color: #d1d5db;
          min-width: 100px;
          display: inline-block;
        }

        .debug-meta {
          margin-top: 8px;
          padding: 8px;
          background: #111827;
          border-radius: 4px;
          border: 1px solid #374151;
        }

        .debug-meta small {
          color: #9ca3af;
        }

        .expand-icon {
          font-weight: bold;
          color: #60a5fa;
          font-size: 16px;
        }

        .debug-sample h4 {
          color: #f3f4f6;
          margin: 0 0 12px 0;
          font-size: 15px;
        }
      `}</style>
    </div>
  );
};

export default PlaidDebugger;