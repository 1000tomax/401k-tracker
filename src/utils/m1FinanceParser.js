import { ACCOUNT_TYPES, ACCOUNT_PROVIDERS } from './accountTypes.js';

// M1 Finance transaction type mappings to standard activity types
const M1_TRANSACTION_TYPES = {
  PURCHASED: 'Exchange In',  // Map to neutral activity type for brokerage rebalancing
  SOLD: 'Exchange Out',      // Map to neutral activity type for brokerage rebalancing
  TRANSFER: 'Transfer',
  DIVIDEND: 'Dividend',
  INTEREST: 'Interest',
  FEE: 'Fee',
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal'
};

// Helper function to parse M1 Finance date format
function parseM1Date(dateStr) {
  if (!dateStr) return '';

  // Handle M1 Finance date format: "Sep 22, 2025"
  const cleanDate = dateStr.replace(/"/g, '').trim();
  const date = new Date(cleanDate);

  if (isNaN(date.getTime())) {
    return '';
  }

  // Return in ISO format (YYYY-MM-DD)
  return date.toISOString().split('T')[0];
}

// Helper function to parse numeric values
function parseNumber(value) {
  if (value == null) return 0;

  const str = String(value).trim();
  if (!str) return 0;

  // Remove quotes, dollar signs, and commas
  const cleaned = str.replace(/["$,]/g, '');

  // Handle negative values in parentheses or with minus sign
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')') || cleaned.startsWith('-');
  const numStr = cleaned.replace(/[()]/g, '').replace(/^-/, '');

  const num = parseFloat(numStr);
  return isNaN(num) ? 0 : (isNegative ? -num : num);
}

// Parse M1 Finance Activity CSV
export function parseM1ActivityCsv(csvText) {
  if (!csvText) return [];

  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = lines[0].split(',').map(col => col.replace(/"/g, '').trim());

  const dateIdx = header.findIndex(col => col.toLowerCase().includes('date'));
  const postedDateIdx = header.findIndex(col => col.toLowerCase().includes('posted date'));
  const symbolIdx = header.findIndex(col => col.toLowerCase() === 'symbol');
  const descriptionIdx = header.findIndex(col => col.toLowerCase().includes('description'));
  const transactionTypeIdx = header.findIndex(col => col.toLowerCase().includes('transaction type'));
  const amountIdx = header.findIndex(col => col.toLowerCase().includes('amount'));
  const unitsIdx = header.findIndex(col => col.toLowerCase().includes('units'));
  const unitTypeIdx = header.findIndex(col => col.toLowerCase().includes('unit type'));
  const unitPriceIdx = header.findIndex(col => col.toLowerCase().includes('unit price'));
  const securityIdIdx = header.findIndex(col => col.toLowerCase().includes('security id'));
  const securityIdTypeIdx = header.findIndex(col => col.toLowerCase().includes('security id type'));

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV row (handle quoted values)
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length < header.length) continue;

    const date = parseM1Date(values[dateIdx]);
    const symbol = values[symbolIdx]?.replace(/"/g, '').trim();
    const description = values[descriptionIdx]?.replace(/"/g, '').trim();
    const transactionType = values[transactionTypeIdx]?.replace(/"/g, '').trim();
    const amount = parseNumber(values[amountIdx]);
    const units = parseNumber(values[unitsIdx]);
    const unitType = values[unitTypeIdx]?.replace(/"/g, '').trim();
    const unitPrice = parseNumber(values[unitPriceIdx]);
    const securityId = values[securityIdIdx]?.replace(/"/g, '').trim();
    const securityIdType = values[securityIdTypeIdx]?.replace(/"/g, '').trim();

    if (!date) continue;

    // Map M1 transaction type to standard activity
    let activity = M1_TRANSACTION_TYPES[transactionType] || transactionType || 'Unknown';

    // Determine if this is a security transaction or cash transaction
    const isSecurityTransaction = symbol && symbol !== '' && units !== 0;
    const fund = isSecurityTransaction ? symbol : 'Cash';

    // For cash transactions that look like deposits, use "Deposit" activity
    if (!isSecurityTransaction && (transactionType === 'TRANSFER' || description.toLowerCase().includes('deposit'))) {
      activity = 'Deposit';
    }

    transactions.push({
      date,
      activity,
      fund,
      symbol,
      description,
      transactionType,
      units: isSecurityTransaction ? units : 0,
      unitPrice: isSecurityTransaction ? unitPrice : 0,
      amount,
      unitType,
      securityId,
      securityIdType,
      moneySource: 'M1 Finance',
      provider: ACCOUNT_PROVIDERS.M1_FINANCE,
      importSource: 'csv',
      importedAt: new Date().toISOString(),
      rawData: {
        originalLine: line,
        parsedValues: values
      }
    });
  }

  return transactions;
}

// Parse M1 Finance Holdings CSV
export function parseM1HoldingsCsv(csvText) {
  if (!csvText) return [];

  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = lines[0].split(',').map(col => col.replace(/"/g, '').trim());

  const symbolIdx = header.findIndex(col => col.toLowerCase() === 'symbol');
  const nameIdx = header.findIndex(col => col.toLowerCase() === 'name');
  const quantityIdx = header.findIndex(col => col.toLowerCase() === 'quantity');
  const avgPriceIdx = header.findIndex(col => col.toLowerCase().includes('avg') && col.toLowerCase().includes('price'));
  const costBasisIdx = header.findIndex(col => col.toLowerCase().includes('cost basis'));
  const unrealizedGainDollarIdx = header.findIndex(col => col.toLowerCase().includes('unrealized gain') && col.includes('$'));
  const unrealizedGainPercentIdx = header.findIndex(col => col.toLowerCase().includes('unrealized gain') && col.includes('%'));
  const valueIdx = header.findIndex(col => col.toLowerCase() === 'value');

  const holdings = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV row (handle quoted values)
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length < header.length) continue;

    const symbol = values[symbolIdx]?.replace(/"/g, '').trim();
    const name = values[nameIdx]?.replace(/"/g, '').trim();
    const quantity = parseNumber(values[quantityIdx]);
    const avgPrice = parseNumber(values[avgPriceIdx]);
    const costBasis = parseNumber(values[costBasisIdx]);
    const unrealizedGainDollar = parseNumber(values[unrealizedGainDollarIdx]);
    const unrealizedGainPercent = parseNumber(values[unrealizedGainPercentIdx]);
    const value = parseNumber(values[valueIdx]);

    if (!symbol || quantity === 0) continue;

    holdings.push({
      symbol,
      name,
      quantity,
      avgPrice,
      costBasis,
      unrealizedGainLoss: unrealizedGainDollar,
      unrealizedGainLossPercent: unrealizedGainPercent,
      marketValue: value,
      currentPrice: quantity > 0 ? value / quantity : avgPrice,
      securityId: symbol,
      provider: ACCOUNT_PROVIDERS.M1_FINANCE,
      importSource: 'csv',
      importedAt: new Date().toISOString(),
      rawData: {
        originalLine: line,
        parsedValues: values
      }
    });
  }

  return holdings;
}

// Transform M1 Finance data to match existing portfolio structure
export function transformM1DataToPortfolioFormat(transactions, holdings) {
  const transformedTransactions = transactions.map(tx => ({
    date: tx.date,
    activity: tx.activity,
    fund: tx.fund,
    moneySource: tx.moneySource || 'M1 Finance',
    units: tx.units,
    unitPrice: tx.unitPrice,
    amount: tx.amount,
    symbol: tx.symbol,
    description: tx.description,
    accountType: ACCOUNT_TYPES.TAXABLE_BROKERAGE,
    provider: ACCOUNT_PROVIDERS.M1_FINANCE,
    importSource: 'csv',
    importedAt: tx.importedAt,
    rawData: tx.rawData
  }));

  return {
    transactions: transformedTransactions,
    holdings: holdings || [],
    metadata: {
      provider: ACCOUNT_PROVIDERS.M1_FINANCE,
      accountType: ACCOUNT_TYPES.TAXABLE_BROKERAGE,
      importedAt: new Date().toISOString(),
      transactionCount: transformedTransactions.length,
      holdingCount: holdings?.length || 0
    }
  };
}

// Create M1 Finance account structure for multi-account portfolio
export function createM1FinanceAccount(transactions, holdings, accountName = 'M1 Finance Account') {
  const accountId = `m1_finance_${Date.now()}`;

  // Calculate totals from holdings
  const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const totalCostBasis = holdings.reduce((sum, holding) => sum + holding.costBasis, 0);
  const totalUnrealizedGain = totalValue - totalCostBasis;

  // Calculate contributions from transactions (only actual cash deposits, not security purchases)
  const totalContributions = transactions
    .filter(tx => {
      // Only count cash deposits, not security purchases
      return tx.activity === 'Deposit' && tx.amount > 0;
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return {
    accountId,
    name: accountName,
    officialName: accountName,
    type: 'investment',
    subtype: 'brokerage',
    accountType: ACCOUNT_TYPES.TAXABLE_BROKERAGE,
    provider: ACCOUNT_PROVIDERS.M1_FINANCE,
    balances: {
      current: totalValue,
      isoCurrencyCode: 'USD'
    },
    holdings: holdings.map(holding => ({
      accountId,
      securityId: holding.symbol,
      symbol: holding.symbol,
      name: holding.name,
      quantity: holding.quantity,
      institutionPrice: holding.avgPrice,
      institutionValue: holding.marketValue,
      costBasis: holding.costBasis,
      livePrice: holding.currentPrice,
      liveValue: holding.marketValue,
      unrealizedGainLoss: holding.unrealizedGainLoss,
      unrealizedGainLossPercent: holding.unrealizedGainLossPercent,
      lastPriceUpdate: new Date().toISOString()
    })),
    transactions: transactions.map(tx => ({ ...tx, accountId })),
    lastSyncAt: new Date().toISOString(),
    status: 'active',
    metadata: {
      totalValue,
      totalCostBasis,
      totalContributions,
      totalUnrealizedGain,
      holdingCount: holdings.length,
      transactionCount: transactions.length
    }
  };
}