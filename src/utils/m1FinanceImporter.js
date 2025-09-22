import { parseM1ActivityCsv, parseM1HoldingsCsv, createM1FinanceAccount, transformM1DataToPortfolioFormat } from './m1FinanceParser.js';
import { ACCOUNT_TYPES, ACCOUNT_PROVIDERS } from './accountTypes.js';
import { aggregatePortfolio } from './parseTransactions.js';

// Helper to detect file type based on headers
function detectM1FileType(csvText) {
  const firstLine = csvText.split('\n')[0]?.toLowerCase() || '';

  if (firstLine.includes('symbol') && firstLine.includes('transaction type') && firstLine.includes('amount')) {
    return 'activity';
  }

  if (firstLine.includes('symbol') && firstLine.includes('name') && firstLine.includes('quantity') && firstLine.includes('value')) {
    return 'holdings';
  }

  return 'unknown';
}

// Import M1 Finance data from file contents
export function importM1FinanceData(activityCsvText, holdingsCsvText, options = {}) {
  const {
    accountName = 'M1 Finance Account',
    accountType = ACCOUNT_TYPES.TAXABLE_BROKERAGE,
    mergeWithExisting = false,
    existingData = null
  } = options;

  const results = {
    success: false,
    account: null,
    transactions: [],
    holdings: [],
    errors: [],
    warnings: [],
    summary: {}
  };

  try {
    // Parse activity data
    let transactions = [];
    if (activityCsvText) {
      const fileType = detectM1FileType(activityCsvText);
      if (fileType === 'activity') {
        transactions = parseM1ActivityCsv(activityCsvText);
        results.summary.transactionsFound = transactions.length;
      } else {
        results.warnings.push('Activity file format not recognized - may not be M1 Finance activity export');
      }
    }

    // Parse holdings data
    let holdings = [];
    if (holdingsCsvText) {
      const fileType = detectM1FileType(holdingsCsvText);
      if (fileType === 'holdings') {
        holdings = parseM1HoldingsCsv(holdingsCsvText);
        results.summary.holdingsFound = holdings.length;
      } else {
        results.warnings.push('Holdings file format not recognized - may not be M1 Finance holdings export');
      }
    }

    if (transactions.length === 0 && holdings.length === 0) {
      results.errors.push('No valid M1 Finance data found in provided files');
      return results;
    }

    // Create account structure
    const account = createM1FinanceAccount(transactions, holdings, accountName);
    account.accountType = accountType;

    // Transform data to portfolio format
    const portfolioData = transformM1DataToPortfolioFormat(transactions, holdings);

    // Calculate portfolio metrics using existing aggregation logic
    let portfolioMetrics = {};
    if (transactions.length > 0) {
      portfolioMetrics = aggregatePortfolio(transactions);
    }

    results.success = true;
    results.account = account;
    results.transactions = transactions;
    results.holdings = holdings;
    results.portfolioData = portfolioData;
    results.portfolioMetrics = portfolioMetrics;

    results.summary = {
      ...results.summary,
      accountCreated: true,
      accountId: account.accountId,
      totalValue: account.metadata.totalValue,
      totalCostBasis: account.metadata.totalCostBasis,
      totalUnrealizedGain: account.metadata.totalUnrealizedGain,
      holdingCount: holdings.length,
      transactionCount: transactions.length
    };

  } catch (error) {
    results.errors.push(`Import failed: ${error.message}`);
    console.error('M1 Finance import error:', error);
  }

  return results;
}

// Import from file objects (for use with file input)
export async function importM1FinanceFromFiles(files, options = {}) {
  const fileContents = {};

  // Read file contents
  for (const file of files) {
    const text = await file.text();
    const fileName = file.name.toLowerCase();

    if (fileName.includes('activity')) {
      fileContents.activity = text;
    } else if (fileName.includes('holdings')) {
      fileContents.holdings = text;
    } else {
      // Try to detect based on content
      const fileType = detectM1FileType(text);
      if (fileType === 'activity') {
        fileContents.activity = text;
      } else if (fileType === 'holdings') {
        fileContents.holdings = text;
      }
    }
  }

  return importM1FinanceData(fileContents.activity, fileContents.holdings, options);
}

// Merge M1 Finance data with existing portfolio
export function mergeM1DataWithPortfolio(m1ImportResult, existingPortfolio) {
  if (!m1ImportResult.success || !existingPortfolio) {
    return m1ImportResult;
  }

  const merged = { ...existingPortfolio };

  // Add M1 account to accounts
  if (merged.accounts) {
    merged.accounts[m1ImportResult.account.accountId] = m1ImportResult.account;
  } else {
    merged.accounts = {
      [m1ImportResult.account.accountId]: m1ImportResult.account
    };
  }

  // Update consolidated totals
  if (merged.consolidatedTotals && m1ImportResult.account.metadata) {
    merged.consolidatedTotals.totalValue += m1ImportResult.account.metadata.totalValue;
    merged.consolidatedTotals.totalContributions += m1ImportResult.account.metadata.totalContributions;
    merged.consolidatedTotals.totalEarnings += m1ImportResult.account.metadata.totalUnrealizedGain;
    merged.consolidatedTotals.totalUnrealizedGainLoss += m1ImportResult.account.metadata.totalUnrealizedGain;
    merged.consolidatedTotals.accountCount += 1;
    merged.consolidatedTotals.lastUpdated = new Date().toISOString();
  }

  // Update account type breakdown
  const accountType = m1ImportResult.account.accountType;
  if (merged.byAccountType) {
    if (!merged.byAccountType[accountType]) {
      merged.byAccountType[accountType] = {
        totalValue: 0,
        totalContributions: 0,
        totalEarnings: 0,
        accountCount: 0,
        accounts: []
      };
    }

    merged.byAccountType[accountType].totalValue += m1ImportResult.account.metadata.totalValue;
    merged.byAccountType[accountType].totalContributions += m1ImportResult.account.metadata.totalContributions;
    merged.byAccountType[accountType].totalEarnings += m1ImportResult.account.metadata.totalUnrealizedGain;
    merged.byAccountType[accountType].accountCount += 1;
    merged.byAccountType[accountType].accounts.push(m1ImportResult.account.accountId);
  }

  // Update data sources
  if (merged.dataSources) {
    if (!merged.dataSources.manual) {
      merged.dataSources.manual = {
        enabled: true,
        transactionCount: 0
      };
    }
    merged.dataSources.manual.transactionCount += m1ImportResult.transactions.length;
    merged.dataSources.manual.lastImport = new Date().toISOString();
  }

  return {
    ...m1ImportResult,
    mergedPortfolio: merged
  };
}

// Validate M1 Finance data before import
export function validateM1FinanceData(activityCsvText, holdingsCsvText) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    activityFileValid: false,
    holdingsFileValid: false
  };

  // Validate activity file
  if (activityCsvText) {
    const fileType = detectM1FileType(activityCsvText);
    if (fileType === 'activity') {
      validation.activityFileValid = true;
      try {
        const transactions = parseM1ActivityCsv(activityCsvText);
        if (transactions.length === 0) {
          validation.warnings.push('Activity file contains no valid transactions');
        }
      } catch (error) {
        validation.errors.push(`Activity file parsing error: ${error.message}`);
        validation.activityFileValid = false;
      }
    } else {
      validation.errors.push('Activity file does not appear to be M1 Finance activity export');
    }
  }

  // Validate holdings file
  if (holdingsCsvText) {
    const fileType = detectM1FileType(holdingsCsvText);
    if (fileType === 'holdings') {
      validation.holdingsFileValid = true;
      try {
        const holdings = parseM1HoldingsCsv(holdingsCsvText);
        if (holdings.length === 0) {
          validation.warnings.push('Holdings file contains no valid holdings');
        }
      } catch (error) {
        validation.errors.push(`Holdings file parsing error: ${error.message}`);
        validation.holdingsFileValid = false;
      }
    } else {
      validation.errors.push('Holdings file does not appear to be M1 Finance holdings export');
    }
  }

  if (!validation.activityFileValid && !validation.holdingsFileValid) {
    validation.valid = false;
    validation.errors.push('No valid M1 Finance files provided');
  }

  if (validation.errors.length > 0) {
    validation.valid = false;
  }

  return validation;
}