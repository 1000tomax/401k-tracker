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
      const url = `${this.apiUrl}/api/sync/holdings`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sync failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Error syncing holdings:', error);
      throw error;
    }
  }
}

export default HoldingsService;