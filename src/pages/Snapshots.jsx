/**
 * @file Snapshots.jsx
 * @description Snapshot management page for viewing, deleting, and regenerating portfolio snapshots
 */
import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import PinProtection from '../components/PinProtection.jsx';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

export default function Snapshots() {
  const [snapshots, setSnapshots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [createDate, setCreateDate] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  /**
   * Fetch all snapshots from the API
   */
  const loadSnapshots = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/snapshots/list`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load snapshots');
      }

      setSnapshots(data.snapshots || []);
    } catch (err) {
      console.error('Error loading snapshots:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  /**
   * Delete a snapshot by date
   */
  const handleDelete = async (date) => {
    try {
      setActionInProgress(date);
      setError(null);

      const response = await fetch(`${API_URL}/api/snapshots/delete?date=${date}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to delete snapshot');
      }

      // Refresh the list
      await loadSnapshots();
      setConfirmDelete(null);
    } catch (err) {
      console.error('Error deleting snapshot:', err);
      setError(err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  /**
   * Regenerate a snapshot (delete then create)
   */
  const handleRegenerate = async (date) => {
    try {
      setActionInProgress(date);
      setError(null);

      // First delete the existing snapshot
      const deleteResponse = await fetch(`${API_URL}/api/snapshots/delete?date=${date}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
      });

      const deleteData = await deleteResponse.json();

      if (!deleteResponse.ok || !deleteData.ok) {
        throw new Error(deleteData.error || 'Failed to delete snapshot for regeneration');
      }

      // Now create a new snapshot for that date
      const createResponse = await fetch(`${API_URL}/api/snapshots/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
        body: JSON.stringify({ date, source: 'manual-regenerate' }),
      });

      const createData = await createResponse.json();

      if (!createResponse.ok || !createData.ok) {
        throw new Error(createData.error || 'Failed to regenerate snapshot');
      }

      // Refresh the list
      await loadSnapshots();
    } catch (err) {
      console.error('Error regenerating snapshot:', err);
      setError(err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  /**
   * Create a new snapshot for a specific date
   */
  const handleCreate = async (e) => {
    e.preventDefault();

    if (!createDate) {
      setError('Please select a date');
      return;
    }

    try {
      setActionInProgress('create');
      setError(null);

      const response = await fetch(`${API_URL}/api/snapshots/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': API_TOKEN,
        },
        body: JSON.stringify({ date: createDate, source: 'manual' }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create snapshot');
      }

      // Refresh the list and reset form
      await loadSnapshots();
      setCreateDate('');
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating snapshot:', err);
      setError(err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  /**
   * Format source name for display
   */
  const formatSource = (source) => {
    const sourceMap = {
      'github-actions': 'Automated (GitHub)',
      'automated': 'Automated',
      'manual': 'Manual',
      'manual-regenerate': 'Regenerated',
    };
    return sourceMap[source] || source || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="snapshots-page">
        <div className="page-header">
          <h2>Portfolio Snapshots</h2>
        </div>
        <div className="loading-state">Loading snapshots...</div>
      </div>
    );
  }

  return (
    <div className="snapshots-page">
      <div className="page-header">
        <div className="page-header-content">
          <h2>Portfolio Snapshots</h2>
          <p className="page-subtitle">
            View and manage your daily portfolio snapshots. Each snapshot captures your portfolio value at a point in time.
          </p>
        </div>
        <PinProtection
          onSuccess={() => setShowCreateForm(!showCreateForm)}
          actionName="create a new snapshot"
          description="Creating a snapshot manually will generate a new portfolio snapshot for the selected date."
        >
          <button className="btn btn-primary">
            {showCreateForm ? 'Cancel' : 'Create Snapshot'}
          </button>
        </PinProtection>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {showCreateForm && (
        <div className="create-form-container">
          <form onSubmit={handleCreate} className="create-form">
            <div className="form-group">
              <label htmlFor="snapshot-date">Snapshot Date</label>
              <input
                type="date"
                id="snapshot-date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
            <PinProtection
              onSuccess={(e) => handleCreate(e || { preventDefault: () => {} })}
              actionName="create this snapshot"
              description="This will create a new portfolio snapshot for the selected date with current data."
            >
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionInProgress === 'create'}
              >
                {actionInProgress === 'create' ? 'Creating...' : 'Create Snapshot'}
              </button>
            </PinProtection>
          </form>
        </div>
      )}

      <div className="snapshots-summary">
        <div className="summary-stat">
          <span className="stat-value">{snapshots.length}</span>
          <span className="stat-label">Total Snapshots</span>
        </div>
        {snapshots.length > 0 && (
          <>
            <div className="summary-stat">
              <span className="stat-value">{formatDate(snapshots[0]?.date)}</span>
              <span className="stat-label">Latest Snapshot</span>
            </div>
            <div className="summary-stat">
              <span className="stat-value">{formatDate(snapshots[snapshots.length - 1]?.date)}</span>
              <span className="stat-label">Earliest Snapshot</span>
            </div>
          </>
        )}
      </div>

      {snapshots.length === 0 ? (
        <div className="empty-state">
          <p>No snapshots found. Snapshots are created automatically each trading day.</p>
        </div>
      ) : (
        <div className="snapshots-table-container">
          <table className="snapshots-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Market Value</th>
                <th className="text-right">Cost Basis</th>
                <th className="text-right">Gain/Loss</th>
                <th className="text-right">Return</th>
                <th className="text-center">Holdings</th>
                <th>Source</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td className="date-cell">
                    <span className="date-primary">{formatDate(snapshot.date)}</span>
                    {snapshot.marketStatus && (
                      <span className={`market-status market-status-${snapshot.marketStatus}`}>
                        {snapshot.marketStatus}
                      </span>
                    )}
                  </td>
                  <td className="text-right">{formatCurrency(snapshot.marketValue)}</td>
                  <td className="text-right">{formatCurrency(snapshot.costBasis)}</td>
                  <td className={`text-right ${snapshot.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(snapshot.gainLoss)}
                  </td>
                  <td className={`text-right ${snapshot.gainLossPercent >= 0 ? 'positive' : 'negative'}`}>
                    {snapshot.gainLossPercent.toFixed(2)}%
                  </td>
                  <td className="text-center">{snapshot.holdingsCount}</td>
                  <td>
                    <span className={`source-badge source-${snapshot.source || 'unknown'}`}>
                      {formatSource(snapshot.source)}
                    </span>
                  </td>
                  <td className="actions-cell">
                    {confirmDelete === snapshot.date ? (
                      <div className="confirm-actions">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(snapshot.date)}
                          disabled={actionInProgress === snapshot.date}
                        >
                          {actionInProgress === snapshot.date ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmDelete(null)}
                          disabled={actionInProgress === snapshot.date}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <PinProtection
                          onSuccess={() => handleRegenerate(snapshot.date)}
                          actionName="regenerate this snapshot"
                          description="Regenerating a snapshot will delete the current data and recreate it with fresh data."
                        >
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={actionInProgress !== null}
                            title="Regenerate snapshot with current data"
                          >
                            {actionInProgress === snapshot.date ? 'Regenerating...' : 'Regenerate'}
                          </button>
                        </PinProtection>
                        <PinProtection
                          onSuccess={() => setConfirmDelete(snapshot.date)}
                          actionName="delete this snapshot"
                          description="Deleting a snapshot permanently removes it from your history. This action cannot be undone."
                        >
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={actionInProgress !== null}
                            title="Delete this snapshot"
                          >
                            Delete
                          </button>
                        </PinProtection>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
