/**
 * Plaid Transaction Manager
 * Handles direct auto-import from Plaid with smart deduplication
 */

import PlaidService from './PlaidService';
import MockPlaidService from './MockPlaidService';
import TransactionHashService from './TransactionHashService';
import { shouldImportTransaction } from '../config/accountConfig.js';

class PlaidTransactionManager {
  constructor() {
    this.lastSyncTimes = new Map(); // Track sync times per connection
  }

  /**
   * Auto-import transactions from Plaid connection
   * @param {Object} plaidConnectionData - Plaid connection information
   * @param {Array} existingTransactions - Current transactions in app
   * @param {Object} options - Import options
   * @returns {Object} Import results
   */
  async autoImportFromPlaid(plaidConnectionData, existingTransactions = [], options = {}) {
    const {
      dateRange = 90, // Days to fetch
      skipDuplicateCheck = false,
      autoSaveConnection = true
    } = options;

    console.log('🚀 Starting Plaid auto-import:', {
      institution: plaidConnectionData.institution?.name,
      accounts: plaidConnectionData.accounts?.length || 0,
      existingTransactions: existingTransactions.length,
      dateRange
    });

    try {
      // Determine service (mock vs real Plaid)
      const isMockData = plaidConnectionData.accessToken?.includes('mock');
      const service = isMockData ? MockPlaidService : PlaidService;

      // Fetch investment transactions
      const rawPlaidData = await service.getInvestmentTransactions(
        plaidConnectionData.accessToken,
        this.calculateStartDate(dateRange),
        this.calculateEndDate()
      );

      console.log('📊 Plaid data fetched:', {
        transactions: rawPlaidData.investment_transactions?.length || 0,
        securities: rawPlaidData.securities?.length || 0,
        accounts: rawPlaidData.accounts?.length || 0
      });

      // Convert to app format with enhanced metadata
      const convertedTransactions = this.convertPlaidTransactions(
        rawPlaidData,
        plaidConnectionData,
        isMockData
      );

      console.log('🔄 Transactions converted:', {
        converted: convertedTransactions.length,
        dateRange: this.getTransactionDateRange(convertedTransactions)
      });

      // Deduplicate against existing transactions
      let deduplicationResults;
      if (skipDuplicateCheck || existingTransactions.length === 0) {
        console.log('⏭️ Skipping deduplication check');
        deduplicationResults = {
          imported: convertedTransactions,
          duplicates: [],
          conflicts: [],
          errors: [],
          stats: {
            total: convertedTransactions.length,
            imported: convertedTransactions.length,
            skipped: 0,
            conflicts: 0
          }
        };
      } else {
        console.log('🔍 Running deduplication against existing transactions...');
        deduplicationResults = TransactionHashService.deduplicateTransactions(
          existingTransactions,
          convertedTransactions,
          {
            strategy: 'skip_duplicates',
            logDuplicates: true,
            dateToleranceDays: 1 // Allow 1 day tolerance for date mismatches
          }
        );
      }

      // Update sync time
      this.updateLastSyncTime(plaidConnectionData.accessToken);

      // Prepare results
      const results = {
        success: true,
        imported: deduplicationResults.imported,
        duplicates: deduplicationResults.duplicates,
        conflicts: deduplicationResults.conflicts,
        errors: deduplicationResults.errors,
        stats: deduplicationResults.stats,
        rawPlaidData,
        connectionData: plaidConnectionData,
        syncTimestamp: new Date().toISOString(),
        isMockData
      };

      console.log('✅ Auto-import completed:', {
        imported: results.stats.imported,
        duplicates: results.stats.skipped,
        conflicts: results.stats.conflicts,
        errors: results.errors.length
      });

      return results;

    } catch (error) {
      console.error('❌ Auto-import failed:', error);
      return {
        success: false,
        error: error.message,
        imported: [],
        duplicates: [],
        conflicts: [],
        errors: [{ error: error.message }],
        stats: {
          total: 0,
          imported: 0,
          skipped: 0,
          conflicts: 0
        },
        connectionData: plaidConnectionData
      };
    }
  }

  /**
   * Convert Plaid transactions to app format with enhanced metadata
   * @param {Object} rawPlaidData - Raw Plaid API response
   * @param {Object} connectionData - Plaid connection information
   * @param {boolean} isMockData - Whether this is mock data
   * @returns {Array} Enhanced transactions
   */
  convertPlaidTransactions(rawPlaidData, connectionData, isMockData = false) {
    const { investment_transactions = [], securities = [], accounts = [] } = rawPlaidData;

    // Create lookup maps for enrichment
    const securitiesMap = new Map(securities.map(sec => [sec.security_id, sec]));
    const accountsMap = new Map(accounts.map(acc => [acc.account_id, acc]));

    // Filter and convert investment transactions
    const converted = investment_transactions
      .filter(plaidTx => {
        // Only include actual security transactions (buy/sell), skip transfers and dividends without securities
        const hasSecurityId = plaidTx.security_id && plaidTx.security_id.trim() !== '';
        const isTradeTransaction = ['buy', 'sell', 'purchase', 'purchased', 'sold'].includes(plaidTx.type?.toLowerCase());
        const hasQuantity = plaidTx.quantity && Math.abs(parseFloat(plaidTx.quantity)) > 0;

        return hasSecurityId && (isTradeTransaction || hasQuantity);
      })
      .map(plaidTx => {
        // Get related data
        const security = securitiesMap.get(plaidTx.security_id);
        const account = accountsMap.get(plaidTx.account_id);

        // Convert to app format
        const activity = this.mapPlaidActivity(plaidTx.type);
        const rawUnits = parseFloat(plaidTx.quantity) || 0;
        const rawAmount = parseFloat(plaidTx.amount) || 0;

        // For sell transactions, keep negative units and amounts
        const isSell = activity === 'Sell';
        const units = isSell ? -Math.abs(rawUnits) : Math.abs(rawUnits);
        const amount = isSell ? -Math.abs(rawAmount) : Math.abs(rawAmount);

        const baseTx = {
          date: plaidTx.date,
          fund: this.formatFundName(plaidTx, security),
          moneySource: this.formatAccountName(account),
          activity: activity,
          units: units,
          unitPrice: parseFloat(plaidTx.price) || 0,
          amount: amount
        };

        // Enhance with metadata using TransactionHashService
        const enhanced = TransactionHashService.enhanceTransaction(baseTx, {
          sourceType: isMockData ? 'mock' : 'plaid',
          sourceId: connectionData.itemId || 'unknown',
          plaidTransactionId: plaidTx.investment_transaction_id,
          // Additional Plaid metadata
          plaidData: {
            accountId: plaidTx.account_id,
            securityId: plaidTx.security_id,
            fees: plaidTx.fees || 0,
            originalType: plaidTx.type,
            institution: connectionData.institution?.name,
            securityTicker: security?.ticker_symbol,
            securityName: security?.name,
            securityType: security?.type,
            accountType: account?.type,
            accountSubtype: account?.subtype
          }
        });

        // Store account reference for filtering
        enhanced._account = account;

        return enhanced;
      });

    // Apply account-specific symbol filtering
    const filtered = converted.filter(tx => {
      const account = tx._account;
      const shouldImport = shouldImportTransaction(
        tx,
        account?.account_id,
        account?.name
      );

      // Clean up temp reference
      delete tx._account;

      return shouldImport;
    });

    console.log(`🔍 Symbol filtering: ${converted.length} converted → ${filtered.length} after account rules`);

    return filtered;
  }

  /**
   * Check if Plaid data needs refreshing
   * @param {string} accessToken - Plaid access token
   * @param {number} maxAgeHours - Maximum age in hours before refresh needed
   * @returns {boolean} True if refresh is needed
   */
  shouldRefreshPlaidData(accessToken, maxAgeHours = 24) {
    const lastSync = this.lastSyncTimes.get(accessToken);
    if (!lastSync) return true;

    const ageHours = (Date.now() - lastSync) / (1000 * 60 * 60);
    return ageHours >= maxAgeHours;
  }

  /**
   * Update last sync time for a connection
   * @param {string} accessToken - Plaid access token
   */
  updateLastSyncTime(accessToken) {
    this.lastSyncTimes.set(accessToken, Date.now());
  }

  /**
   * Get last sync time for a connection
   * @param {string} accessToken - Plaid access token
   * @returns {Date|null} Last sync date or null
   */
  getLastSyncTime(accessToken) {
    const timestamp = this.lastSyncTimes.get(accessToken);
    return timestamp ? new Date(timestamp) : null;
  }

  /**
   * Format fund name from Plaid transaction and security data
   * @param {Object} plaidTx - Plaid transaction
   * @param {Object} security - Security information
   * @returns {string} Formatted fund name
   */
  formatFundName(plaidTx, security) {
    // Prioritize ticker symbol for cleaner display
    if (security?.ticker_symbol) {
      return security.ticker_symbol;
    }
    // Fallback to security name if no ticker
    if (security?.name) {
      return security.name;
    }
    // Use transaction name as fallback
    if (plaidTx.name) {
      return plaidTx.name;
    }
    return security?.security_id || plaidTx.security_id || 'Unknown Fund';
  }

  /**
   * Format account name from Plaid account data
   * @param {Object} account - Plaid account information
   * @returns {string} Formatted account name
   */
  formatAccountName(account) {
    if (!account) return 'Investment Account';

    // Check if it's a Roth IRA and simplify the name
    if (account.subtype === 'ira' &&
        (account.name?.toLowerCase().includes('roth') ||
         account.official_name?.toLowerCase().includes('roth'))) {
      return 'Roth IRA';
    }

    const parts = [];
    if (account.name) parts.push(account.name);
    if (account.official_name && account.official_name !== account.name) {
      parts.push(account.official_name);
    }
    if (account.subtype) parts.push(account.subtype.toUpperCase());

    return parts.length > 0 ? parts[0] : 'Investment Account';
  }

  /**
   * Map Plaid transaction type to app activity
   * @param {string} plaidType - Plaid transaction type
   * @returns {string} App activity type
   */
  mapPlaidActivity(plaidType) {
    const typeMap = {
      'buy': 'Buy',
      'sell': 'Sell',
      'purchase': 'Buy',
      'purchased': 'Buy',
      'sold': 'Sell',
      'sale': 'Sell',
      'dividend': 'Dividend',
      'fee': 'Fee',
      'transfer': 'Transfer',
      'deposit': 'Buy',
      'withdrawal': 'Sell',
      'cash': 'Dividend',
      'cancel': 'Cancel'
    };

    return typeMap[plaidType?.toLowerCase()] || 'Buy';
  }

  /**
   * Calculate start date for fetching transactions
   * @param {number} daysBack - Number of days back to fetch
   * @returns {string} ISO date string
   */
  calculateStartDate(daysBack) {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate end date for fetching transactions (today)
   * @returns {string} ISO date string
   */
  calculateEndDate() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get date range of transactions
   * @param {Array} transactions - Array of transactions
   * @returns {Object} Date range info
   */
  getTransactionDateRange(transactions) {
    if (transactions.length === 0) return { earliest: null, latest: null, count: 0 };

    const dates = transactions.map(tx => new Date(tx.date).getTime());
    return {
      earliest: new Date(Math.min(...dates)).toISOString().split('T')[0],
      latest: new Date(Math.max(...dates)).toISOString().split('T')[0],
      count: transactions.length
    };
  }

  /**
   * Generate human-readable import summary
   * @param {Object} results - Import results
   * @returns {Object} Summary information
   */
  generateImportSummary(results) {
    const { stats, connectionData, isMockData, syncTimestamp } = results;

    return {
      success: results.success,
      message: results.success
        ? `Successfully imported ${stats.imported} transactions from ${connectionData.institution?.name || 'your account'}`
        : `Failed to import transactions: ${results.error}`,
      details: {
        imported: stats.imported,
        duplicates: stats.skipped,
        conflicts: stats.conflicts,
        errors: results.errors.length,
        source: isMockData ? 'Mock Data' : connectionData.institution?.name,
        syncTime: syncTimestamp,
        accounts: connectionData.accounts?.length || 0
      },
      recommendations: this.generateRecommendations(results)
    };
  }

  /**
   * Generate recommendations based on import results
   * @param {Object} results - Import results
   * @returns {Array} Array of recommendation strings
   */
  generateRecommendations(results) {
    const recommendations = [];

    if (results.stats.skipped > 0) {
      recommendations.push(`${results.stats.skipped} duplicate transactions were skipped`);
    }

    if (results.stats.conflicts > 0) {
      recommendations.push(`${results.stats.conflicts} potential conflicts detected - review manually`);
    }

    if (results.errors.length > 0) {
      recommendations.push(`${results.errors.length} errors occurred during import`);
    }

    if (results.stats.imported === 0 && results.success) {
      recommendations.push('No new transactions found - your data is up to date');
    }

    return recommendations;
  }
}

export default new PlaidTransactionManager();