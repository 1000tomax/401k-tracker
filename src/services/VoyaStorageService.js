/**
 * Storage service for Voya balance snapshots
 * Stores historical balance data in browser localStorage
 */

class VoyaStorageService {
  constructor() {
    this.storageKey = 'voya_snapshots_v1';
  }

  /**
   * Save a new balance snapshot
   * @param {object} snapshotData - Parsed Voya data with timestamp, account, holdings, sources
   */
  async saveSnapshot(snapshotData) {
    try {
      console.log('💾 VoyaStorageService: Saving snapshot', {
        balance: snapshotData.account?.balance,
        timestamp: snapshotData.timestamp
      });

      // Get existing snapshots
      const snapshots = await this.getAllSnapshots();

      // Add new snapshot
      snapshots.push(snapshotData);

      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Save to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(snapshots));

      console.log('✅ VoyaStorageService: Snapshot saved successfully', {
        totalSnapshots: snapshots.length
      });

      return true;
    } catch (error) {
      console.error('❌ VoyaStorageService: Failed to save snapshot:', error);
      throw error;
    }
  }

  /**
   * Get all balance snapshots
   * @returns {array} Array of snapshot objects
   */
  async getAllSnapshots() {
    try {
      const stored = localStorage.getItem(this.storageKey);

      if (!stored) {
        console.log('ℹ️ VoyaStorageService: No snapshots found');
        return [];
      }

      const snapshots = JSON.parse(stored);
      console.log('✅ VoyaStorageService: Loaded snapshots', {
        count: snapshots.length
      });

      return snapshots;
    } catch (error) {
      console.error('❌ VoyaStorageService: Failed to load snapshots:', error);
      return [];
    }
  }

  /**
   * Get the most recent snapshot
   * @returns {object|null} Latest snapshot or null if none exist
   */
  async getLatestSnapshot() {
    try {
      const snapshots = await this.getAllSnapshots();

      if (snapshots.length === 0) {
        return null;
      }

      // Sort by timestamp (newest first) and return first
      const sorted = snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return sorted[0];
    } catch (error) {
      console.error('❌ VoyaStorageService: Failed to get latest snapshot:', error);
      return null;
    }
  }

  /**
   * Clear all snapshots
   */
  clearAllSnapshots() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('✅ VoyaStorageService: All snapshots cleared');
      return true;
    } catch (error) {
      console.error('❌ VoyaStorageService: Failed to clear snapshots:', error);
      return false;
    }
  }

  /**
   * Delete a specific snapshot by timestamp
   * @param {string} timestamp - ISO timestamp of snapshot to delete
   */
  async deleteSnapshot(timestamp) {
    try {
      const snapshots = await this.getAllSnapshots();
      const filtered = snapshots.filter(s => s.timestamp !== timestamp);

      localStorage.setItem(this.storageKey, JSON.stringify(filtered));

      console.log('✅ VoyaStorageService: Snapshot deleted', { timestamp });
      return true;
    } catch (error) {
      console.error('❌ VoyaStorageService: Failed to delete snapshot:', error);
      return false;
    }
  }

  /**
   * Check if any snapshots exist
   */
  hasSnapshots() {
    const stored = localStorage.getItem(this.storageKey);
    return !!stored && JSON.parse(stored).length > 0;
  }
}

export default new VoyaStorageService();
