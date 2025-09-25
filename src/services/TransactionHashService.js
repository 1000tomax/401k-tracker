/**
 * Transaction Hash Service
 * Provides smart deduplication for transactions using multi-layer hashing
 */

class TransactionHashService {
  /**
   * Generate transaction hashes for deduplication
   * @param {Object} transaction - Transaction object
   * @returns {Object} Hash object with primary and fuzzy hashes
   */
  generateHashes(transaction) {
    const { date, amount, fund, activity, units, unitPrice } = transaction;

    // Normalize values for consistent hashing
    const normalizedAmount = Math.abs(parseFloat(amount) || 0).toFixed(2);
    const normalizedUnits = Math.abs(parseFloat(units) || 0).toFixed(4);
    const normalizedPrice = Math.abs(parseFloat(unitPrice) || 0).toFixed(4);
    const normalizedDate = new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
    const normalizedFund = fund?.trim().toLowerCase() || '';
    const normalizedActivity = activity?.trim().toLowerCase() || '';

    // Primary hash: Exact match for duplicate detection
    const primaryData = `${normalizedDate}|${normalizedAmount}|${normalizedFund}|${normalizedActivity}`;

    // Fuzzy hash: For catching similar transactions with minor differences
    const fuzzyData = `${normalizedDate}|${normalizedAmount}|${normalizedFund}`;

    // Enhanced hash: Includes units and price for investment transactions
    const enhancedData = `${normalizedDate}|${normalizedAmount}|${normalizedFund}|${normalizedUnits}|${normalizedPrice}`;

    return {
      primary: this.simpleHash(primaryData),
      fuzzy: this.simpleHash(fuzzyData),
      enhanced: this.simpleHash(enhancedData),
      rawData: {
        primary: primaryData,
        fuzzy: fuzzyData,
        enhanced: enhancedData
      }
    };
  }

  /**
   * Simple hash function (since we don't have crypto.subtle in all environments)
   * @param {string} str - String to hash
   * @returns {string} Hash string
   */
  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Enhance transaction with hash metadata
   * @param {Object} transaction - Original transaction
   * @param {Object} options - Enhancement options
   * @returns {Object} Enhanced transaction with hashes and metadata
   */
  enhanceTransaction(transaction, options = {}) {
    const {
      sourceType = 'unknown',
      sourceId = null,
      plaidTransactionId = null
    } = options;

    const hashes = this.generateHashes(transaction);
    const now = new Date().toISOString();

    return {
      // Original transaction data
      ...transaction,

      // Source tracking
      sourceType,
      sourceId,
      plaidTransactionId,

      // Hash fingerprinting
      transactionHash: hashes.primary,
      fuzzyHash: hashes.fuzzy,
      enhancedHash: hashes.enhanced,
      hashData: hashes.rawData,

      // Metadata
      importedAt: now,
      lastUpdatedAt: now
    };
  }

  /**
   * Find potential duplicates in a transaction array
   * @param {Array} transactions - Array of transactions to check
   * @param {Object} newTransaction - New transaction to check against
   * @param {Object} options - Deduplication options
   * @returns {Object} Deduplication results
   */
  findDuplicates(transactions, newTransaction, options = {}) {
    const {
      strictMode = false,
      includeFuzzy = true,
      dateToleranceDays = 0
    } = options;

    const newHashes = this.generateHashes(newTransaction);
    const duplicates = {
      exact: [],
      fuzzy: [],
      enhanced: [],
      conflicts: []
    };

    for (const existingTx of transactions) {
      // Skip transactions without hashes (legacy data)
      if (!existingTx.transactionHash) continue;

      // Date tolerance check
      if (dateToleranceDays > 0) {
        const dateDiff = Math.abs(
          new Date(newTransaction.date) - new Date(existingTx.date)
        ) / (1000 * 60 * 60 * 24);

        if (dateDiff > dateToleranceDays) continue;
      }

      // Exact match (primary hash)
      if (existingTx.transactionHash === newHashes.primary) {
        duplicates.exact.push(existingTx);
        continue;
      }

      // Enhanced match (includes units/price)
      if (existingTx.enhancedHash === newHashes.enhanced) {
        duplicates.enhanced.push(existingTx);
        continue;
      }

      // Fuzzy match (similar transaction)
      if (includeFuzzy && existingTx.fuzzyHash === newHashes.fuzzy) {
        duplicates.fuzzy.push(existingTx);

        // Check if fuzzy match is actually a conflict (different activity)
        if (existingTx.activity?.toLowerCase() !== newTransaction.activity?.toLowerCase()) {
          duplicates.conflicts.push({
            existing: existingTx,
            new: newTransaction,
            reason: 'activity_mismatch'
          });
        }
      }
    }

    return {
      ...duplicates,
      hasDuplicates: duplicates.exact.length > 0 || duplicates.enhanced.length > 0,
      hasFuzzyMatches: duplicates.fuzzy.length > 0,
      hasConflicts: duplicates.conflicts.length > 0,
      newTransactionHashes: newHashes
    };
  }

  /**
   * Deduplicate an array of transactions
   * @param {Array} existingTransactions - Current transactions
   * @param {Array} newTransactions - New transactions to merge
   * @param {Object} options - Deduplication options
   * @returns {Object} Deduplication results
   */
  deduplicateTransactions(existingTransactions, newTransactions, options = {}) {
    const {
      strategy = 'skip_duplicates', // 'skip_duplicates', 'update_existing', 'merge_smart'
      preserveSource = true,
      logDuplicates = true
    } = options;

    const results = {
      imported: [],
      duplicates: [],
      conflicts: [],
      errors: [],
      stats: {
        total: newTransactions.length,
        imported: 0,
        skipped: 0,
        updated: 0,
        conflicts: 0
      }
    };

    for (const newTx of newTransactions) {
      try {
        const dupCheck = this.findDuplicates(existingTransactions, newTx, options);

        if (dupCheck.hasDuplicates) {
          // Handle exact duplicates
          results.duplicates.push({
            transaction: newTx,
            matches: [...dupCheck.exact, ...dupCheck.enhanced],
            type: 'exact'
          });
          results.stats.skipped++;

          if (logDuplicates) {
            console.log(`🔍 Skipping duplicate transaction: ${newTx.date} ${newTx.fund} $${newTx.amount}`);
          }
          continue;
        }

        if (dupCheck.hasConflicts) {
          // Handle conflicts (fuzzy matches with differences)
          results.conflicts.push(...dupCheck.conflicts);
          results.stats.conflicts++;

          if (strategy === 'skip_duplicates') {
            console.log(`⚠️ Conflict detected, skipping: ${newTx.date} ${newTx.fund} $${newTx.amount}`);
            continue;
          }
        }

        // No duplicates found, safe to import
        results.imported.push(newTx);
        results.stats.imported++;

      } catch (error) {
        results.errors.push({
          transaction: newTx,
          error: error.message
        });
        console.error('Error processing transaction for deduplication:', error);
      }
    }

    return results;
  }

  /**
   * Generate comprehensive deduplication report
   * @param {Object} results - Results from deduplicateTransactions
   * @returns {Object} Human-readable report
   */
  generateReport(results) {
    const { stats, duplicates, conflicts, errors } = results;

    return {
      summary: {
        total: stats.total,
        imported: stats.imported,
        skipped: stats.skipped,
        conflicts: stats.conflicts,
        errors: errors.length,
        successRate: stats.total > 0 ? ((stats.imported / stats.total) * 100).toFixed(1) : '0.0'
      },
      details: {
        duplicates: duplicates.map(dup => ({
          date: dup.transaction.date,
          fund: dup.transaction.fund,
          amount: dup.transaction.amount,
          matchCount: dup.matches.length
        })),
        conflicts: conflicts.map(conflict => ({
          date: conflict.new.date,
          fund: conflict.new.fund,
          amount: conflict.new.amount,
          reason: conflict.reason,
          existingActivity: conflict.existing.activity,
          newActivity: conflict.new.activity
        })),
        errors: errors.map(err => ({
          transaction: err.transaction,
          error: err.error
        }))
      }
    };
  }
}

export default new TransactionHashService();