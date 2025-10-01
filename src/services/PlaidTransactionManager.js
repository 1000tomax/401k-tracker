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

      // Convert to app format with enhanced metadata - now returns {transactions, dividends}
      const converted = this.convertPlaidTransactions(
        rawPlaidData,
        plaidConnectionData,
        isMockData
      );

      // Apply account-specific filtering
      const filteredTransactions = this.applyAccountFiltering(converted.transactions, 'transaction');
      const filteredDividends = this.applyAccountFiltering(converted.dividends, 'dividend');

      console.log('🔄 Data converted and filtered:', {
        transactions: filteredTransactions.length,
        dividends: filteredDividends.length,
        dateRange: this.getTransactionDateRange(filteredTransactions)
      });

      // Deduplicate transactions against existing transactions
      let transactionDedup;
      if (skipDuplicateCheck || existingTransactions.length === 0) {
        console.log('⏭️ Skipping transaction deduplication check');
        transactionDedup = {
          imported: filteredTransactions,
          duplicates: [],
          conflicts: [],
          errors: [],
          stats: {
            total: filteredTransactions.length,
            imported: filteredTransactions.length,
            skipped: 0,
            conflicts: 0
          }
        };
      } else {
        console.log('🔍 Running transaction deduplication...');
        transactionDedup = TransactionHashService.deduplicateTransactions(
          existingTransactions,
          filteredTransactions,
          {
            strategy: 'skip_duplicates',
            logDuplicates: true,
            dateToleranceDays: 1
          }
        );
      }

      // Update sync time
      this.updateLastSyncTime(plaidConnectionData.accessToken);

      // Prepare results with both transactions and dividends
      const results = {
        success: true,
        // Transactions
        imported: transactionDedup.imported,
        duplicates: transactionDedup.duplicates,
        conflicts: transactionDedup.conflicts,
        errors: transactionDedup.errors,
        stats: transactionDedup.stats,
        // Dividends (always imported, backend will deduplicate)
        dividends: filteredDividends,
        dividendStats: {
          total: filteredDividends.length,
          imported: filteredDividends.length
        },
        // Metadata
        rawPlaidData,
        connectionData: plaidConnectionData,
        syncTimestamp: new Date().toISOString(),
        isMockData
      };

      console.log('✅ Auto-import completed:', {
        transactions: results.stats.imported,
        dividends: results.dividends.length,
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
        dividends: [],
        duplicates: [],
        conflicts: [],
        errors: [{ error: error.message }],
        stats: {
          total: 0,
          imported: 0,
          skipped: 0,
          conflicts: 0
        },
        dividendStats: {
          total: 0,
          imported: 0
        },
        connectionData: plaidConnectionData
      };
    }
  }

  /**
   * Convert Plaid transactions to app format with enhanced metadata
   * Now splits transactions into two streams: transactions (buy/sell) and dividends
   * @param {Object} rawPlaidData - Raw Plaid API response
   * @param {Object} connectionData - Plaid connection information
   * @param {boolean} isMockData - Whether this is mock data
   * @returns {Object} Object containing {transactions: [], dividends: []}
   */
  convertPlaidTransactions(rawPlaidData, connectionData, isMockData = false) {
    const { investment_transactions = [], securities = [], accounts = [] } = rawPlaidData;

    // Create lookup maps for enrichment
    const securitiesMap = new Map(securities.map(sec => [sec.security_id, sec]));
    const accountsMap = new Map(accounts.map(acc => [acc.account_id, acc]));

    const transactions = [];
    const dividends = [];

    // Process all investment transactions
    for (const plaidTx of investment_transactions) {
      const security = securitiesMap.get(plaidTx.security_id);
      const account = accountsMap.get(plaidTx.account_id);
      const txType = plaidTx.type?.toLowerCase();

      // Classify transaction type
      const isDividend = ['dividend', 'cash'].includes(txType);
      const isTradeTransaction = ['buy', 'sell', 'purchase', 'purchased', 'sold'].includes(txType);
      const hasSecurityId = plaidTx.security_id && plaidTx.security_id.trim() !== '';
      const hasQuantity = plaidTx.quantity && Math.abs(parseFloat(plaidTx.quantity)) > 0;

      if (isDividend) {
        // Extract dividend
        dividends.push(this.extractDividend(plaidTx, security, account, connectionData, isMockData));
      } else if (hasSecurityId && (isTradeTransaction || hasQuantity)) {
        // Extract buy/sell transaction
        transactions.push(this.extractTransaction(plaidTx, security, account, connectionData, isMockData));
      }
    }

    console.log(`📊 Split Plaid data: ${transactions.length} transactions, ${dividends.length} dividends`);

    return { transactions, dividends };
  }

  /**
   * Extract a buy/sell transaction from Plaid data
   * @private
   */
  extractTransaction(plaidTx, security, account, connectionData, isMockData) {
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
  }

  /**
   * Extract a dividend from Plaid data
   * @private
   */
  extractDividend(plaidTx, security, account, connectionData, isMockData) {
    const amount = Math.abs(parseFloat(plaidTx.amount) || 0);
    const fundName = this.formatFundName(plaidTx, security);
    const accountName = this.formatAccountName(account);

    // Create dividend hash for deduplication
    const hashComponents = [
      plaidTx.date,
      fundName,
      accountName,
      amount.toFixed(2)
    ].join('|');

    const dividendHash = TransactionHashService.createHash(hashComponents);

    const dividend = {
      date: plaidTx.date,
      fund: fundName,
      account: accountName,
      amount: amount,

      // Source tracking
      sourceType: isMockData ? 'mock' : 'plaid',
      sourceId: connectionData.itemId || 'unknown',
      plaidTransactionId: plaidTx.investment_transaction_id,
      plaidAccountId: plaidTx.account_id,

      // Enhanced metadata
      securityId: security?.cusip || security?.isin || plaidTx.security_id,
      securityType: security?.type || 'unknown',
      dividendType: this.inferDividendType(plaidTx.type, plaidTx.name),

      // Deduplication
      dividendHash: dividendHash,

      // Metadata
      metadata: {
        institution: connectionData.institution?.name,
        securityTicker: security?.ticker_symbol,
        securityName: security?.name,
        fees: plaidTx.fees || 0,
        originalType: plaidTx.type,
        accountType: account?.type,
        accountSubtype: account?.subtype
      }
    };

    // Store account reference for filtering
    dividend._account = account;

    return dividend;
  }

  /**
   * Infer dividend type from transaction data
   * @private
   */
  inferDividendType(type, name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('qualified')) return 'qualified';
    if (lower.includes('capital gain')) return 'capital_gains';
    if (lower.includes('ordinary')) return 'ordinary';
    return 'ordinary'; // Default
  }

  /**
   * Apply account-specific filtering to transactions and dividends
   * @private
   */
  applyAccountFiltering(items, itemType = 'transaction') {
    const filtered = items.filter(item => {
      const account = item._account;
      const shouldImport = shouldImportTransaction(
        item,
        account?.account_id,
        account?.name
      );

      // Clean up temp reference
      delete item._account;

      return shouldImport;
    });

    console.log(`🔍 Symbol filtering (${itemType}): ${items.length} → ${filtered.length} after account rules`);

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
    const { stats, dividendStats, connectionData, isMockData, syncTimestamp } = results;

    const transactionsImported = stats.imported;
    const dividendsImported = dividendStats?.imported || 0;
    const total = transactionsImported + dividendsImported;

    return {
      success: results.success,
      message: results.success
        ? `Successfully imported ${total} items (${transactionsImported} transactions, ${dividendsImported} dividends) from ${connectionData.institution?.name || 'your account'}`
        : `Failed to import data: ${results.error}`,
      details: {
        transactions: transactionsImported,
        dividends: dividendsImported,
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

    const transactionsImported = results.stats.imported;
    const dividendsImported = results.dividendStats?.imported || 0;

    if (transactionsImported === 0 && dividendsImported === 0 && results.success) {
      recommendations.push('No new data found - your data is up to date');
    }

    if (dividendsImported > 0) {
      recommendations.push(`${dividendsImported} dividend payments tracked for passive income analytics`);
    }

    return recommendations;
  }
}

export default new PlaidTransactionManager();