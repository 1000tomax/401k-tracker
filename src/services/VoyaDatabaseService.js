/**
 * Voya Database Service
 * Handles saving Voya transactions to the database
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
   * Import Voya transactions to the database
   * @param {Array} transactions - Array of parsed transaction objects
   * @returns {Promise} Response from API with import results
   */
  async importTransactions(transactions) {
    try {
      console.log('💾 VoyaDatabaseService: Importing transactions to database', {
        count: transactions.length
      });

      // Add source metadata to each transaction
      const voyaTransactions = transactions.map(tx => ({
        ...tx,
        source_type: 'voya',
        source_id: 'voya_401k',
      }));

      const response = await fetch(`${this.baseURL}/db/transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ transactions: voyaTransactions }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to import transactions: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ VoyaDatabaseService: Transactions imported successfully', {
        imported: data.results?.imported,
        duplicates: data.results?.duplicates,
        total: data.results?.total
      });

      return {
        imported: data.results?.imported || 0,
        duplicates: data.results?.duplicates || 0,
        updated: data.results?.updated || 0,
        total: data.results?.total || 0,
        errors: data.results?.errors || 0,
      };
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to import transactions:', error);
      throw error;
    }
  }

  /**
   * Get latest Voya transactions from database
   * @param {number} limit - Number of transactions to fetch
   * @returns {Promise<Array>} Array of transactions
   */
  async getLatestTransactions(limit = 10) {
    try {
      console.log('📥 VoyaDatabaseService: Fetching latest transactions from database');

      const response = await fetch(`${this.baseURL}/db/transactions?source_type=voya&limit=${limit}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get transactions: ${response.status}`);
      }

      const data = await response.json();

      console.log('✅ VoyaDatabaseService: Fetched transactions', {
        count: data.transactions?.length || 0
      });

      return data.transactions || [];
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to get transactions:', error);
      // Return empty array instead of throwing - this is not critical
      return [];
    }
  }

  /**
   * Get all Voya transactions from database
   * @param {object} options - Query options (dateFrom, dateTo, etc.)
   * @returns {Promise<Array>} Array of transactions
   */
  async getAllTransactions(options = {}) {
    try {
      const { dateFrom, dateTo, fund } = options;
      const params = new URLSearchParams({
        source_type: 'voya',
      });

      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (fund) params.append('fund', fund);

      console.log('📥 VoyaDatabaseService: Fetching all transactions from database');

      const response = await fetch(`${this.baseURL}/db/transactions?${params.toString()}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get transactions: ${response.status}`);
      }

      const data = await response.json();

      console.log('✅ VoyaDatabaseService: Fetched all transactions', {
        count: data.transactions?.length || 0
      });

      return data.transactions || [];
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to get all transactions:', error);
      throw error;
    }
  }

  /**
   * Delete a transaction by ID
   * @param {string} transactionId - Transaction ID to delete
   * @returns {Promise} Response from API
   */
  async deleteTransaction(transactionId) {
    try {
      console.log('🗑️ VoyaDatabaseService: Deleting transaction', { transactionId });

      const response = await fetch(`${this.baseURL}/db/transactions/${transactionId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete transaction: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ VoyaDatabaseService: Transaction deleted successfully');

      return data;
    } catch (error) {
      console.error('❌ VoyaDatabaseService: Failed to delete transaction:', error);
      throw error;
    }
  }
}

export default new VoyaDatabaseService();
