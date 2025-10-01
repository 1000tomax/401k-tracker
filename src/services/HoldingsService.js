/**
 * Holdings Service
 * Fetches current holdings and historical snapshots from API
 */

export class HoldingsService {
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  async getSnapshots(daysBack = 90) {
    try {
      const url = `${this.apiUrl}/api/holdings/snapshots?days=${daysBack}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch holdings');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching holdings:', error);
      throw error;
    }
  }

  async syncNow() {
    try {
      const url = `${this.apiUrl}/api/sync/transactions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMessage = error.details || error.error || 'Sync failed';
        console.error('❌ Sync failed:', errorMessage);
        if (error.details) {
          console.error('Details:', error.details);
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('Error syncing transactions:', error);
      throw error;
    }
  }

  async getLatestPrices() {
    try {
      const url = `${this.apiUrl}/api/prices/latest`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('Failed to fetch live prices:', error);
        return null; // Return null on error, will fall back to transaction prices
      }

      const data = await response.json();
      return data.ok ? data.prices : null;
    } catch (error) {
      console.error('Error fetching live prices:', error);
      return null; // Graceful degradation - use transaction prices
    }
  }
}

export default HoldingsService;