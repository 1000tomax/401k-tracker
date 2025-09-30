/**
 * Voya Transaction Parser
 * Parses copy-pasted transaction data from Voya website
 * Uses the existing parseTransactions utility for consistent transaction handling
 */
import { parseTransactions } from '../utils/parseTransactions.js';

class VoyaParser {
  /**
   * Parse pasted Voya transaction data
   * @param {string} pastedText - Raw text copied from Voya transaction history
   * @returns {object} Parsed transaction data
   */
  parse(pastedText) {
    try {
      console.log('🔍 VoyaParser: Starting parse of pasted transaction data');

      // Use the existing parseTransactions utility
      // It already handles the format from Voya:
      // Date  Activity  Fund  Money Source  Units  Price  Amount
      const transactions = parseTransactions(pastedText);

      if (transactions.length === 0) {
        throw new Error('No valid transactions found in pasted text. Please make sure you copied the transaction history from Voya.');
      }

      console.log(`✅ VoyaParser: Successfully parsed ${transactions.length} transaction(s)`);

      // Add Voya-specific metadata to each transaction
      const voyaTransactions = transactions.map(tx => ({
        ...tx,
        sourceType: 'voya',
        sourceId: 'voya_401k',
      }));

      return {
        timestamp: new Date().toISOString(),
        transactions: voyaTransactions,
        count: voyaTransactions.length,
      };
    } catch (error) {
      console.error('❌ VoyaParser: Parse failed:', error);
      throw error;
    }
  }

  /**
   * Validate parsed transaction data
   * @param {object} parsedData - Data returned from parse()
   * @returns {boolean} True if valid
   */
  validate(parsedData) {
    if (!parsedData || !parsedData.transactions) {
      throw new Error('Invalid parsed data: missing transactions');
    }

    if (!Array.isArray(parsedData.transactions)) {
      throw new Error('Invalid parsed data: transactions must be an array');
    }

    if (parsedData.transactions.length === 0) {
      throw new Error('No transactions found in parsed data');
    }

    // Validate each transaction has required fields
    for (const tx of parsedData.transactions) {
      if (!tx.date) {
        throw new Error('Transaction missing required field: date');
      }
      if (!tx.fund) {
        throw new Error('Transaction missing required field: fund');
      }
      if (!tx.activity) {
        throw new Error('Transaction missing required field: activity');
      }
    }

    return true;
  }

  /**
   * Get transaction summary for display
   * @param {object} parsedData - Data returned from parse()
   * @returns {object} Summary statistics
   */
  getSummary(parsedData) {
    if (!parsedData || !parsedData.transactions) {
      return null;
    }

    const transactions = parsedData.transactions;
    const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const totalShares = transactions.reduce((sum, tx) => sum + (tx.units || 0), 0);

    // Group by money source
    const bySource = {};
    transactions.forEach(tx => {
      const source = tx.moneySource || 'Unknown';
      if (!bySource[source]) {
        bySource[source] = {
          count: 0,
          amount: 0,
          shares: 0,
        };
      }
      bySource[source].count++;
      bySource[source].amount += tx.amount || 0;
      bySource[source].shares += tx.units || 0;
    });

    // Group by activity type
    const byActivity = {};
    transactions.forEach(tx => {
      const activity = tx.activity || 'Unknown';
      if (!byActivity[activity]) {
        byActivity[activity] = {
          count: 0,
          amount: 0,
        };
      }
      byActivity[activity].count++;
      byActivity[activity].amount += tx.amount || 0;
    });

    return {
      totalTransactions: transactions.length,
      totalAmount,
      totalShares,
      bySource,
      byActivity,
      dateRange: {
        earliest: transactions.reduce((min, tx) => tx.date < min ? tx.date : min, transactions[0].date),
        latest: transactions.reduce((max, tx) => tx.date > max ? tx.date : max, transactions[0].date),
      },
    };
  }
}

export default new VoyaParser();
