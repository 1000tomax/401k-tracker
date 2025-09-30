import { useState, useEffect } from 'react';
import VoyaParser from '../services/VoyaParser';
import VoyaStorageService from '../services/VoyaStorageService';
import VoyaDatabaseService from '../services/VoyaDatabaseService';
import './VoyaPasteImport.css';

/**
 * Voya Paste Import Component
 * Allows users to copy-paste data from Voya website to import balance snapshots
 */
function VoyaPasteImport({ onImportSuccess, onImportError }) {
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    // Load latest snapshot on mount
    loadLatestSnapshot();
  }, []);

  const loadLatestSnapshot = async () => {
    try {
      // Try to load from database first
      const snapshot = await VoyaDatabaseService.getLatestSnapshot();
      if (snapshot) {
        setLatestSnapshot(snapshot);
        console.log('✅ Loaded latest Voya snapshot from database:', snapshot);
      } else {
        // Fallback to localStorage if no database snapshot
        const localSnapshot = await VoyaStorageService.getLatestSnapshot();
        if (localSnapshot) {
          setLatestSnapshot(localSnapshot);
          console.log('✅ Loaded latest Voya snapshot from localStorage:', localSnapshot);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load latest snapshot:', error);
    }
  };

  const handleParse = () => {
    if (!pastedText.trim()) {
      alert('Please paste some data first!');
      return;
    }

    setIsProcessing(true);

    try {
      const parsed = VoyaParser.parse(pastedText);
      VoyaParser.validate(parsed);

      setParsedData(parsed);
      setShowPreview(true);

      console.log('✅ Data parsed successfully:', parsed);
    } catch (error) {
      console.error('❌ Parse error:', error);
      alert(`Failed to parse data: ${error.message}`);

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
      // Save to database (primary storage)
      const result = await VoyaDatabaseService.saveSnapshot(parsedData);

      // Also save to localStorage as backup/cache
      await VoyaStorageService.saveSnapshot(parsedData);

      setLatestSnapshot(parsedData);

      console.log('✅ Snapshot saved successfully to database and localStorage');
      alert(`Voya balance snapshot saved successfully!\n\nSaved ${result.saved} holdings:\n${result.snapshots.map(s => `- ${s.account}: $${s.market_value.toLocaleString()}`).join('\n')}`);

      // Clear the form
      setPastedText('');
      setParsedData(null);
      setShowPreview(false);

      if (onImportSuccess) {
        onImportSuccess(parsedData);
      }
    } catch (error) {
      console.error('❌ Failed to save snapshot:', error);
      alert(`Failed to save snapshot to database: ${error.message}\n\nPlease check your connection and try again.`);

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

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Show preview mode
  if (showPreview && parsedData) {
    return (
      <div className="voya-paste-import">
        <div className="preview-container">
          <h3>📋 Preview Parsed Data</h3>

          <div className="preview-section">
            <h4>Account Balance</h4>
            <div className="balance-display">
              <span className="label">Total Balance:</span>
              <span className="value">${parsedData.account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {parsedData.holdings.length > 0 && (
            <div className="preview-section">
              <h4>Holdings</h4>
              {parsedData.holdings.map((holding, idx) => (
                <div key={idx} className="holding-preview">
                  <div className="holding-name">
                    <strong>{holding.ticker}</strong> - {holding.name}
                  </div>
                  <div className="holding-details">
                    <span>{holding.shares.toFixed(4)} shares @ ${holding.price.toFixed(2)}</span>
                    <span className="holding-value">${holding.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="holding-percentage">{holding.percentage}%</div>
                </div>
              ))}
            </div>
          )}

          {parsedData.sources.length > 0 && (
            <div className="preview-section">
              <h4>Sources</h4>
              {parsedData.sources.map((source, idx) => (
                <div key={idx} className="source-preview">
                  <span className="source-name">{source.name}</span>
                  <span className="source-balance">${source.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          )}

          <div className="button-group">
            <button onClick={handleSave} disabled={isProcessing} className="btn-primary">
              {isProcessing ? '💾 Saving...' : '✅ Save Snapshot'}
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
      {latestSnapshot && (
        <div className="latest-snapshot">
          <h4>💰 Current Balance</h4>
          <div className="snapshot-summary">
            <div className="snapshot-balance">
              <span className="label">Balance:</span>
              <span className="value">${latestSnapshot.account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="snapshot-date">
              <span className="label">Last Updated:</span>
              <span className="value">{formatDate(latestSnapshot.timestamp)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="import-form">
        <h3>📥 Import Voya Data</h3>

        <div className="info-box">
          <p><strong>How to import:</strong></p>
          <ol>
            <li>Log in to <a href="https://my.voya.com" target="_blank" rel="noopener noreferrer">my.voya.com</a></li>
            <li>Navigate to your account balances page</li>
            <li>Select and copy <strong>both sections</strong>:
              <ul>
                <li>Fund Balances (fund name, shares, price)</li>
                <li>Source Balances (PreTax, Roth, Match)</li>
              </ul>
            </li>
            <li>Paste the copied text below</li>
            <li>Click "Parse & Preview"</li>
          </ol>
        </div>

        <div className="form-group">
          <label htmlFor="voya-paste">Paste Voya Data:</label>
          <textarea
            id="voya-paste"
            className="paste-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste fund balances and source balances here...&#x0a;&#x0a;Example:&#x0a;0899 Vanguard 500 Index Fund Adm: 100%&#x0a;$ 39.17  184.44  $7,224.90&#x0a;&#x0a;Employee PreTax&#x0a;$ 4,161.19&#x0a;ROTH&#x0a;$ 74.14&#x0a;..."
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
