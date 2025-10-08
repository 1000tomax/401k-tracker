/**
 * @file VoyaPasteImport.jsx
 * @description A component that allows users to import their Voya 401(k) transaction
 * data by pasting it from the Voya website. It handles parsing, previewing,
 * and saving the data.
 */
import { useState, useEffect } from 'react';
import VoyaParser from '../services/VoyaParser';
import VoyaDatabaseService from '../services/VoyaDatabaseService';
import { formatCurrency, formatShares, formatUnitPrice, formatDate, formatFundName, formatSourceName } from '../utils/formatters.js';
import './VoyaPasteImport.css';

/**
 * The VoyaPasteImport component.
 * @param {object} props - The component's props.
 * @param {function} props.onImportSuccess - Callback function for a successful import.
 * @param {function} props.onImportError - Callback function for a failed import.
 * @returns {React.Component}
 */
function VoyaPasteImport({ onImportSuccess, onImportError }) {
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [latestTransactions, setLatestTransactions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  // Effect hook to load the latest Voya transactions on component mount.
  useEffect(() => {
    loadLatestTransactions();
  }, []);

  /**
   * Fetches the most recent Voya transactions from the database to display to the user.
   */
  const loadLatestTransactions = async () => {
    try {
      const transactions = await VoyaDatabaseService.getLatestTransactions(10);
      if (transactions && transactions.length > 0) {
        setLatestTransactions(transactions);
        console.log('✅ Loaded latest Voya transactions:', transactions.length);
      }
    } catch (error) {
      console.error('❌ Failed to load latest transactions:', error);
    }
  };

  /**
   * Handles the parsing of the pasted text. It uses the VoyaParser service
   * and displays a preview if successful, or an error if not.
   */
  const handleParse = () => {
    if (!pastedText.trim()) {
      alert('Please paste some transaction data first!');
      return;
    }

    setIsProcessing(true);

    try {
      const parsed = VoyaParser.parse(pastedText);
      VoyaParser.validate(parsed);

      setParsedData(parsed);
      setShowPreview(true);

      console.log('✅ Transactions parsed successfully:', parsed);
    } catch (error) {
      console.error('❌ Parse error:', error);
      alert(`Failed to parse transaction data: ${error.message}\n\nPlease make sure you copied the transaction history from Voya with all columns (Date, Activity, Fund, Money Source, Units, Price, Amount).`);

      if (onImportError) {
        onImportError(error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedData) {
      return;
    }

    setIsProcessing(true);

    try {
      // Save transactions to database
      const result = await VoyaDatabaseService.importTransactions(parsedData.transactions);

      console.log('✅ Transactions saved successfully to database');

      const message = result.duplicates > 0
        ? `Imported ${result.imported} new transaction(s).\n${result.duplicates} duplicate(s) were skipped.`
        : `Imported ${result.imported} new transaction(s) successfully!`;

      alert(message);

      // Reload latest transactions
      await loadLatestTransactions();

      // Clear the form
      setPastedText('');
      setParsedData(null);
      setShowPreview(false);

      if (onImportSuccess) {
        onImportSuccess(parsedData);
      }
    } catch (error) {
      console.error('❌ Failed to save transactions:', error);
      alert(`Failed to save transactions to database: ${error.message}\n\nPlease check your connection and try again.`);

      if (onImportError) {
        onImportError(error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setParsedData(null);
    setShowPreview(false);
  };

  const handleClear = () => {
    setPastedText('');
    setParsedData(null);
    setShowPreview(false);
  };

  // Show preview mode
  if (showPreview && parsedData) {
    const summary = VoyaParser.getSummary(parsedData);

    return (
      <div className="voya-paste-import">
        <div className="preview-container">
          <h3>📋 Preview Transactions</h3>

          {summary && (
            <div className="preview-summary">
              <div className="summary-stat">
                <span className="label">Total Transactions:</span>
                <span className="value">{summary.totalTransactions}</span>
              </div>
              <div className="summary-stat">
                <span className="label">Total Amount:</span>
                <span className="value">{formatCurrency(summary.totalAmount)}</span>
              </div>
              <div className="summary-stat">
                <span className="label">Total Shares:</span>
                <span className="value">{formatShares(summary.totalShares)}</span>
              </div>
              <div className="summary-stat">
                <span className="label">Date Range:</span>
                <span className="value">{formatDate(summary.dateRange.earliest)} to {formatDate(summary.dateRange.latest)}</span>
              </div>
            </div>
          )}

          <div className="preview-section">
            <h4>Transactions</h4>
            <div className="table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Fund</th>
                    <th>Source</th>
                    <th>Shares</th>
                    <th>Price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.transactions.map((tx, idx) => (
                    <tr key={idx}>
                      <td>{formatDate(tx.date)}</td>
                      <td>{tx.activity}</td>
                      <td>{formatFundName(tx.fund)}</td>
                      <td>{formatSourceName(tx.moneySource)}</td>
                      <td>{formatShares(tx.units)}</td>
                      <td>{formatUnitPrice(tx.unitPrice)}</td>
                      <td>{formatCurrency(tx.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {summary && summary.bySource && (
            <div className="preview-section">
              <h4>By Money Source</h4>
              <div className="summary-grid">
                {Object.entries(summary.bySource).map(([source, data]) => (
                  <div key={source} className="summary-card">
                    <div className="card-title">{formatSourceName(source)}</div>
                    <div className="card-stat">
                      <span className="label">Transactions:</span>
                      <span className="value">{data.count}</span>
                    </div>
                    <div className="card-stat">
                      <span className="label">Amount:</span>
                      <span className="value">{formatCurrency(data.amount)}</span>
                    </div>
                    <div className="card-stat">
                      <span className="label">Shares:</span>
                      <span className="value">{formatShares(data.shares)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="button-group">
            <button onClick={handleSave} disabled={isProcessing} className="btn-primary">
              {isProcessing ? '💾 Saving...' : '✅ Import Transactions'}
            </button>
            <button onClick={handleCancel} disabled={isProcessing} className="btn-secondary">
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show main import form
  return (
    <div className="voya-paste-import">
      {latestTransactions.length > 0 && (
        <div className="latest-transactions">
          <h4>📊 Recent Transactions</h4>
          <div className="transactions-summary">
            <p>You have {latestTransactions.length} recent Voya transaction(s) imported.</p>
            <p className="meta">Last import: {formatDate(latestTransactions[0]?.date)}</p>
          </div>
        </div>
      )}

      <div className="import-form">
        <h3>📥 Import Voya Transactions</h3>

        <div className="info-box">
          <p><strong>How to import:</strong></p>
          <ol>
            <li>Log in to <a href="https://my.voya.com" target="_blank" rel="noopener noreferrer">my.voya.com</a></li>
            <li>Navigate to your transaction history page</li>
            <li>Select and copy the transaction table with <strong>all columns</strong>:
              <ul>
                <li>Date</li>
                <li>Activity (e.g., "Contribution", "Fund Transfer In")</li>
                <li>Fund (fund name/ticker)</li>
                <li>Money Source (PreTax, Roth, Match, etc.)</li>
                <li># of Units/Shares</li>
                <li>Unit/Share Price</li>
                <li>Amount</li>
              </ul>
            </li>
            <li>Paste the copied text below</li>
            <li>Click "Parse & Preview"</li>
          </ol>
          <p className="note">
            <strong>Note:</strong> "Fund Transfer In" transactions establish your initial cost basis.
            Regular "Contribution" transactions are counted as new contributions.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="voya-paste">Paste Voya Transaction Data:</label>
          <textarea
            id="voya-paste"
            className="paste-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste transaction data here...&#x0a;&#x0a;Example:&#x0a;Date	Activity	Fund	Money Source	# of Units/Shares	Unit/Share Price	Amount&#x0a;09/18/2025	Fund Transfer In	0899 Vanguard 500 Index Fund Adm	Employee PreTax	106.228	$39.006	$4,143.56&#x0a;09/24/2025	Contribution	0899 Vanguard 500 Index Fund Adm	ROTH	1.893	$39.039	$73.89"
            disabled={isProcessing}
            rows={12}
          />
        </div>

        <div className="button-group">
          <button
            onClick={handleParse}
            disabled={isProcessing || !pastedText.trim()}
            className="btn-primary"
          >
            {isProcessing ? '⏳ Processing...' : '🔍 Parse & Preview'}
          </button>
          {pastedText && (
            <button
              onClick={handleClear}
              disabled={isProcessing}
              className="btn-secondary"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default VoyaPasteImport;
