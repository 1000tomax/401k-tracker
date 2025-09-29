/**
 * Plaid Database Service
 * Handles Plaid operations with database persistence
 * Replaces localStorage-based PlaidStorageService
 */

class PlaidDatabaseService {
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
   * Save Plaid connection to database
   */
  async saveConnection({ accessToken, itemId, institutionId, institutionName, accounts }) {
    try {
      console.log('🔐 Saving Plaid connection to database', {
        itemId,
        institutionName,
        accountCount: accounts?.length || 0,
      });

      const response = await fetch(`${this.baseURL}/db/plaid`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          access_token: accessToken,
          item_id: itemId,
          institution_id: institutionId,
          institution_name: institutionName,
          accounts: accounts,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save connection: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Connection saved to database', data.connection);
      return data.connection;
    } catch (error) {
      console.error('❌ Failed to save Plaid connection:', error);
      throw error;
    }
  }

  /**
   * Get all Plaid connections from database
   */
  async getConnections() {
    try {
      console.log('📥 Fetching Plaid connections from database');

      const response = await fetch(`${this.baseURL}/db/plaid`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get connections: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Fetched connections', {
        count: data.connections?.length || 0,
      });
      return data.connections || [];
    } catch (error) {
      console.error('❌ Failed to get Plaid connections:', error);
      throw error;
    }
  }

  /**
   * Sync transactions from Plaid to database
   */
  async syncTransactions(connectionId, startDate = null, endDate = null) {
    try {
      const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      console.log('🔄 Syncing transactions', {
        connectionId,
        dateRange: `${start} to ${end}`,
      });

      const response = await fetch(`${this.baseURL}/db/transactions/sync`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          connection_id: connectionId,
          start_date: start,
          end_date: end,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to sync transactions: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Transactions synced', data.sync);
      return data.sync;
    } catch (error) {
      console.error('❌ Failed to sync transactions:', error);
      throw error;
    }
  }

  /**
   * Get transactions from database
   */
  async getTransactions(filters = {}) {
    try {
      const params = new URLSearchParams();

      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.fund) params.append('fund', filters.fund);
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
      if (filters.sourceType) params.append('source_type', filters.sourceType);
      if (filters.moneySource) params.append('money_source', filters.moneySource);

      console.log('📥 Fetching transactions from database', filters);

      const response = await fetch(`${this.baseURL}/db/transactions?${params}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get transactions: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Fetched transactions', {
        count: data.transactions?.length || 0,
        total: data.pagination?.total || 0,
      });
      return data;
    } catch (error) {
      console.error('❌ Failed to get transactions:', error);
      throw error;
    }
  }

  /**
   * Import transactions to database
   */
  async importTransactions(transactions) {
    try {
      console.log('📤 Importing transactions to database', {
        count: transactions.length,
      });

      const response = await fetch(`${this.baseURL}/db/transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ transactions }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to import transactions: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Transactions imported', data.results);
      return data.results;
    } catch (error) {
      console.error('❌ Failed to import transactions:', error);
      throw error;
    }
  }

  /**
   * Check if user has saved connections
   */
  async hasSavedConnections() {
    try {
      const connections = await this.getConnections();
      return connections.length > 0;
    } catch (error) {
      console.error('Error checking saved connections:', error);
      return false;
    }
  }

  /**
   * Complete Plaid Link flow: exchange token, save connection, sync transactions
   */
  async completePlaidLink(publicToken, metadata) {
    try {
      console.log('🔗 Completing Plaid Link flow', {
        institution: metadata?.institution?.name,
        accounts: metadata?.accounts?.length,
      });

      // Step 1: Exchange public token for access token
      const exchangeResponse = await fetch(`${this.baseURL}/plaid/exchange_public_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
      });

      if (!exchangeResponse.ok) {
        throw new Error('Failed to exchange public token');
      }

      const exchangeData = await exchangeResponse.json();
      const { access_token, item_id } = exchangeData;

      // Step 2: Get account details
      const accountsResponse = await fetch(`${this.baseURL}/plaid/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token }),
      });

      if (!accountsResponse.ok) {
        throw new Error('Failed to get accounts');
      }

      const accountsData = await accountsResponse.json();

      // Step 3: Save connection to database
      const connection = await this.saveConnection({
        accessToken: access_token,
        itemId: item_id,
        institutionId: metadata?.institution?.institution_id,
        institutionName: metadata?.institution?.name,
        accounts: accountsData.accounts,
      });

      // Step 4: Sync transactions
      const syncResult = await this.syncTransactions(connection.id);

      console.log('✅ Plaid Link flow completed', {
        connection: connection.id,
        syncResult,
      });

      return {
        connection,
        syncResult,
      };
    } catch (error) {
      console.error('❌ Failed to complete Plaid Link flow:', error);
      throw error;
    }
  }
}

export default new PlaidDatabaseService();