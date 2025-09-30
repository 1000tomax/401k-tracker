/**
 * Voya Database Service
 * Handles saving Voya snapshots to the database
 */

class VoyaDatabaseService {
  constructor() {
    this.baseURL = '/api';
    this.token = import.meta.env.VITE_401K_TOKEN || '';
  }

  /**
   * Get auth headers
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-401K-Token': this.token,
    };
  }

  /**
   * Save a Voya snapshot to the database
   * @param {object} snapshot - Parsed Voya data with holdings and sources
   * @returns {Promise} Response from API
   */
  async saveSnapshot(snapshot) {
    try {
      console.log('💾 VoyaDatabaseService: Saving snapshot to database', {
        balance: snapshot.account?.balance,
        sources: snapshot.sources?.length,
        timestamp: snapshot.timestamp
      });

      const response = await fetch(`${this.baseURL}/voya/save-snapshot`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ snapshot }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save snapshot: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ VoyaDatabaseService: Snapshot saved successfully', {
        saved: data.saved,
        snapshot_date: data.snapshot_date
      });

      return data;
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to save snapshot:', error);
      throw error;
    }
  }

  /**
   * Get all Voya snapshots from database
   * This would call the holdings/snapshots endpoint which includes all holdings (Plaid + Voya)
   */
  async getSnapshots(daysBack = 90) {
    try {
      console.log('📥 VoyaDatabaseService: Fetching snapshots from database');

      const response = await fetch(`${this.baseURL}/holdings/snapshots?days=${daysBack}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get snapshots: ${response.status}`);
      }

      const data = await response.json();

      // Filter to only Voya accounts
      const voyaHoldings = data.currentHoldings?.filter(h =>
        h.accountName?.includes('401(K)') ||
        h.accountName?.includes('Voya')
      ) || [];

      console.log('✅ VoyaDatabaseService: Fetched Voya snapshots', {
        total: data.currentHoldings?.length,
        voya: voyaHoldings.length
      });

      return {
        ...data,
        voyaHoldings
      };
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to get snapshots:', error);
      throw error;
    }
  }

  /**
   * Get latest Voya snapshot
   */
  async getLatestSnapshot() {
    try {
      const data = await this.getSnapshots(7); // Last 7 days

      if (!data.voyaHoldings || data.voyaHoldings.length === 0) {
        return null;
      }

      // Calculate total balance across all sources
      const totalBalance = data.voyaHoldings.reduce((sum, h) => sum + h.marketValue, 0);

      return {
        timestamp: data.totals?.lastUpdated,
        account: {
          name: 'AUTOMATED HEALTH SYSTEMS 401(K) RETIREMENT PLAN',
          type: '401k',
          balance: totalBalance
        },
        holdings: data.voyaHoldings,
        sources: data.voyaHoldings.map(h => ({
          name: h.accountName.match(/\((.*?)\)/)?.[1] || 'Unknown',
          balance: h.marketValue
        }))
      };
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to get latest snapshot:', error);
      return null;
    }
  }
}

export default new VoyaDatabaseService();
