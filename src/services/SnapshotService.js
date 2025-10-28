/**
 * Snapshot Service
 * Manages portfolio snapshots - creating, backfilling, and retrieving historical data
 */

export class SnapshotService {
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  /**
   * Create a snapshot for a specific date (defaults to today)
   */
  async createSnapshot(date = null) {
    try {
      const url = `${this.apiUrl}/api/snapshots/save`;
      const body = date ? { date, source: 'manual' } : { source: 'automated' };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create snapshot');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating snapshot:', error);
      throw error;
    }
  }

  /**
   * Backfill historical snapshots from transaction data
   */
  async backfillSnapshots(startDate = null, endDate = null) {
    try {
      const url = `${this.apiUrl}/api/snapshots/backfill`;
      const body = {};
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to backfill snapshots');
      }

      return await response.json();
    } catch (error) {
      console.error('Error backfilling snapshots:', error);
      throw error;
    }
  }

  /**
   * Get snapshots for a date range
   */
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
        throw new Error(error.error || 'Failed to fetch snapshots');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      throw error;
    }
  }
}

export default SnapshotService;
