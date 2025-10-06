const KNOWN_ACTIVITIES = [
  'Automatic Rebalance',
  'Dividend',
  'Dividend Reinvestment',
  'Employee Contribution',
  'Employer Contribution',
  'Exchange In',
  'Exchange Out',
  'Fund Transfer In',
  'Fund Transfer Out',
  'Interest',
  'Loan Issue',
  'Loan Repayment',
  'Plan Service Fee',
  'Reallocation',
  'Rebalance',
  'Transfer In',
  'Transfer Out',
];

function toNumber(numLike) {
  if (numLike == null) return 0;
  const str = String(numLike).trim();
  if (!str) return 0;

  const isParensNegative = /^\(.*\)$/.test(str);
  const sanitized = str.replace(/[$,]/g, '').replace(/[()]/g, '').trim();
  const trailingNegative = sanitized.endsWith('-');
  const normalized = trailingNegative ? `-${sanitized.slice(0, -1)}` : sanitized;
  const value = Number.parseFloat(normalized);

  if (!Number.isFinite(value)) return 0;
  return isParensNegative ? -value : value;
}

function parseCsvRow(line) {
  if (!line) return [];

  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length || line.endsWith(',')) {
    values.push(current.trim());
  }

  return values.map(value => value.replace(/\r/g, ''));
}

function smartSplit(line) {
  // This function intelligently splits a line of text into columns,
  // trying different delimiters to handle various formats.
  if (line.includes('\t')) {
    // Handles tab-separated values.
    return line.split('\t').map(part => part.trim()).filter(Boolean);
  }

  const multiSpaceParts = line
    .split(/\s{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
  if (multiSpaceParts.length >= 6) {
    // Handles data separated by multiple spaces, which is common in
    // fixed-width or formatted text.
    return multiSpaceParts;
  }

  // As a fallback, splits by any whitespace. This is less reliable for
  // fund names with spaces but works for simple cases.
  return line
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function toISO(dateStr) {
  const raw = String(dateStr || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const usFormat = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usFormat) {
    const [, mm, dd, yyyy] = usFormat;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${parsed.getFullYear()}-${mm}-${dd}`;
  }
  return raw;
}

function normalizeActivityName(rawActivity, amount) {
  const raw = (rawActivity || '').trim();
  if (!raw) {
    return 'Unknown Activity';
  }

  const lower = raw.toLowerCase();
  if (lower === 'transfer' || lower === 'transfer in' || lower === 'transfer out') {
    if (lower.endsWith('out')) {
      return 'Transfer Out';
    }
    if (lower.endsWith('in')) {
      return 'Transfer In';
    }
    if (Number.isFinite(amount)) {
      if (amount < 0) return 'Transfer Out';
      if (amount > 0) return 'Transfer In';
    }
    return 'Transfer';
  }

  return lower
    .split(/\s+/)
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function parseCsvExport(rawText) {
  if (!rawText) return [];

  const lines = rawText.split(/\r?\n/).map(line => line.replace(/\ufeff/g, ''));
  const headerIndex = lines.findIndex(line => {
    if (!line) return false;
    const normalized = line.replace(/"/g, '').trim().toLowerCase();
    return normalized.startsWith('activity date') && normalized.includes('money source');
  });

  if (headerIndex === -1) {
    return [];
  }

  const header = parseCsvRow(lines[headerIndex]);
  const normalizedHeaders = header.map(field => field.toLowerCase());

  const dateIdx = normalizedHeaders.findIndex(field => field.includes('activity date'));
  const activityIdx = normalizedHeaders.findIndex(field => field === 'activity');
  const fundIdx = normalizedHeaders.findIndex(field => field === 'fund');
  const sourceIdx = normalizedHeaders.findIndex(field => field.includes('money source'));
  const unitsIdx = normalizedHeaders.findIndex(
    field => field.includes('# of units') || field.includes('units'),
  );
  const priceIdx = normalizedHeaders.findIndex(field => field.includes('unit price'));
  const amountIdx = normalizedHeaders.findIndex(field => field === 'amount');

  if ([dateIdx, activityIdx, fundIdx, sourceIdx, unitsIdx, priceIdx].some(index => index === -1)) {
    return [];
  }

  const transactions = [];

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.trim() === '"' || /^-+$/.test(rawLine.trim())) {
      continue;
    }

    const columns = parseCsvRow(rawLine);
    if (!columns.length) {
      continue;
    }

    const date = toISO(columns[dateIdx]);
    const fund = (columns[fundIdx] || '').trim();
    if (!date || !fund) {
      continue;
    }

    const activityRaw = columns[activityIdx] || '';
    const moneySource = (columns[sourceIdx] || 'Unknown').trim() || 'Unknown';
    const units = toNumber(columns[unitsIdx]);
    const unitPrice = toNumber(columns[priceIdx]);
    let amount = amountIdx >= 0 ? toNumber(columns[amountIdx]) : units * unitPrice;
    if (!Number.isFinite(amount)) {
      amount = units * unitPrice;
    }
    if (!Number.isFinite(amount)) {
      amount = 0;
    }

    let finalUnits = Number.isFinite(units) ? units : 0;
    const normalizedActivity = normalizeActivityName(activityRaw, amount);

    if (/transfer\s*out/i.test(normalizedActivity) && finalUnits > 0) {
      finalUnits = -Math.abs(finalUnits);
    } else if (/transfer\s*in/i.test(normalizedActivity) && finalUnits < 0) {
      finalUnits = Math.abs(finalUnits);
    }

    if (amount < 0 && finalUnits > 0) {
      finalUnits = -Math.abs(finalUnits);
    }
    if (amount > 0 && finalUnits < 0) {
      finalUnits = Math.abs(finalUnits);
    }

    transactions.push({
      date,
      activity: normalizedActivity,
      fund,
      moneySource,
      units: finalUnits,
      unitPrice,
      amount,
    });
  }

  return transactions;
}

function extractActivityAndFund(parts) {
  if (!parts.length) {
    return { activity: '', fund: '' };
  }

  const joined = parts.join(' ').trim();
  const lowerJoined = joined.toLowerCase();

  for (const activity of KNOWN_ACTIVITIES) {
    const candidate = activity.toLowerCase();
    if (lowerJoined.startsWith(candidate)) {
      const fund = joined.slice(activity.length).trim();
      return {
        activity,
        fund,
      };
    }
  }

  if (parts.length === 1) {
    const tokens = parts[0].split(/\s+/);
    const activity = tokens.slice(0, Math.min(tokens.length, 2)).join(' ');
    const fund = tokens.slice(Math.min(tokens.length, 2)).join(' ');
    return {
      activity: activity.trim(),
      fund: fund.trim(),
    };
  }

  const activity = parts[0];
  const fund = parts.slice(1).join(' ');
  return {
    activity: activity.trim(),
    fund: fund.trim(),
  };
}

function isDateToken(value) {
  if (!value) return false;
  const token = String(value).trim();
  if (!token) return false;
  return /^(\d{4}-\d{1,2}-\d{1,2})$/.test(token) || /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.test(token);
}

export function parseTransactions(rawText) {
  // This is the main parsing function that handles raw text pasted from Voya.
  // It first attempts to parse the text as a CSV, which is a more structured
  // format. If that fails, it falls back to a line-by-line parsing method
  // using smart splitting.
  if (!rawText) return [];

  const csvTransactions = parseCsvExport(rawText);
  if (csvTransactions.length) {
    return csvTransactions;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const dataLines = lines.filter((line, index) => {
    if (index === 0 && /date/i.test(line) && /activity/i.test(line)) {
      return false;
    }
    return !/^-+$/.test(line);
  });

  const normalizedLines = [];
  for (let i = 0; i < dataLines.length; i += 1) {
    const current = dataLines[i];
    const parts = smartSplit(current);

    if (parts.length === 1 && isDateToken(parts[0]) && i + 1 < dataLines.length) {
      const mergedCandidate = `${parts[0]}\t${dataLines[i + 1]}`;
      const mergedParts = smartSplit(mergedCandidate);
      if (mergedParts.length >= 6) {
        normalizedLines.push(mergedCandidate);
        i += 1; // skip the next line because we merged it
        continue;
      }
    }

    normalizedLines.push(current);
  }

  const rows = normalizedLines
    .map(smartSplit)
    .filter(parts => parts.length >= 6);

  const transactions = [];

  for (const parts of rows) {
    const workingParts = [...parts];
    const rawDate = workingParts.shift();
    if (!rawDate) {
      continue;
    }

    let amountStr;
    let hasAmountField = false;
    if (workingParts.length >= 4) {
      amountStr = workingParts.pop();
      hasAmountField = true;
    }
    const unitPriceStr = workingParts.length >= 3 ? workingParts.pop() : undefined;
    const unitsStr = workingParts.length >= 2 ? workingParts.pop() : undefined;
    const moneySourceRaw = workingParts.length >= 1 ? workingParts.pop() : undefined;

    if (!unitPriceStr || !unitsStr || !workingParts.length) {
      continue;
    }

    const { activity, fund } = extractActivityAndFund(workingParts);
    const date = toISO(rawDate);

    if (!date || !fund) {
      continue;
    }

    const moneySource = (moneySourceRaw || 'Unknown').trim() || 'Unknown';

    const unitPrice = toNumber(unitPriceStr);
    const rawUnits = toNumber(unitsStr);
    let amount = hasAmountField ? toNumber(amountStr) : rawUnits * unitPrice;
    if (!Number.isFinite(amount)) {
      amount = rawUnits * unitPrice;
    }
    if (!Number.isFinite(amount)) {
      amount = 0;
    }

    let finalUnits = Number.isFinite(rawUnits) ? rawUnits : 0;
    const normalizedActivity = normalizeActivityName(activity, amount);

    if (/transfer\s*out/i.test(normalizedActivity) && finalUnits > 0) {
      finalUnits = -Math.abs(finalUnits);
    } else if (/transfer\s*in/i.test(normalizedActivity) && finalUnits < 0) {
      finalUnits = Math.abs(finalUnits);
    }

    if (amount < 0 && finalUnits > 0) {
      finalUnits = -Math.abs(finalUnits);
    }
    if (amount > 0 && finalUnits < 0) {
      finalUnits = Math.abs(finalUnits);
    }

    const transaction = {
      date,
      activity: normalizedActivity,
      fund: fund || 'Unknown Fund',
      moneySource,
      units: finalUnits,
      unitPrice,
      amount,
    };

    transactions.push(transaction);
  }

  return transactions;
}

export function latestNavFor(entries) {
  if (!entries || !entries.length) {
    return 0;
  }

  const sorted = [...entries].sort((a, b) => (a.date > b.date ? -1 : 1));
  const navEntry = sorted.find(entry => Number.isFinite(entry.unitPrice));
  return navEntry ? navEntry.unitPrice : 0;
}

function ensureNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function ensureFundTotals(target, fund) {
  if (!target[fund]) {
    target[fund] = {
      shares: 0,
      costBasis: 0,
      marketValue: 0,
      gainLoss: 0,
    };
  }
  return target[fund];
}

const FLOW_RULES = {
  deposit: [/contribution/i, /dividend/i, /interest/i, /match/i, /loan repayment/i, /deposit/i, /transfer.*from/i, /acat/i],
  withdrawal: [/loan issue/i, /withdrawal/i, /distribution/i, /fee/i, /service fee/i],
  neutral: [/exchange/i, /rebalance/i, /reallocation/i, /buy/i, /sell/i, /fund transfer in/i, /fund transfer out/i], // Buys/Sells/Fund transfers are neutral - we only track current holdings
};

function classifyFlow(activity) {
  const name = (activity || '').toLowerCase();
  if (!name) return 'neutral';
  if (FLOW_RULES.neutral.some(pattern => pattern.test(name))) return 'neutral';
  if (FLOW_RULES.withdrawal.some(pattern => pattern.test(name))) return 'withdrawal';
  if (FLOW_RULES.deposit.some(pattern => pattern.test(name))) return 'deposit';
  return 'deposit';
}

const SHARE_EPSILON = 1e-6;

export function aggregatePortfolio(transactions, livePrices = null) {
  // Normalize transaction field names (database uses snake_case, code expects camelCase)
  const normalizedTransactions = transactions.map(tx => ({
    ...tx,
    unitPrice: tx.unit_price ?? tx.unitPrice,
    moneySource: tx.money_source ?? tx.moneySource,
  }));

  const portfolio = {};
  const totals = {
    shares: 0,
    costBasis: 0,
    marketValue: 0,
    gainLoss: 0,
    unrealizedGainLoss: 0,
    realizedGainLoss: 0,
    contributions: 0,
    netInvested: 0,
    payPeriods: 0,
  };
  let totalWithdrawals = 0;
  const fundTotals = {};
  const runningPositions = {};
  const sourceTotals = {};
  const sourceCashFlows = {};
  const byFundSource = new Map();
  const timelineByDate = new Map();

  const chronological = [...normalizedTransactions]
    .filter(tx => tx && tx.date && tx.fund)
    .sort((a, b) => a.date.localeCompare(b.date));

  let lastUpdated = null;
  let firstTransaction = null;
  const priceTimestamps = {}; // Track price update timestamps by moneySource

  for (const tx of chronological) {
    const key = `${tx.fund}||${tx.moneySource}`;
    if (!byFundSource.has(key)) {
      byFundSource.set(key, []);
    }
    byFundSource.get(key).push(tx);

    if (!firstTransaction || tx.date < firstTransaction) {
      firstTransaction = tx.date;
    }
    if (!lastUpdated || tx.date > lastUpdated) {
      lastUpdated = tx.date;
    }

    const units = ensureNumber(tx.units);
    const amount = ensureNumber(tx.amount);
    const flowType = classifyFlow(tx.activity);
    const magnitude = Math.abs(amount);

    const sourceKey = tx.moneySource || 'Unknown';
    if (!sourceCashFlows[sourceKey]) {
      sourceCashFlows[sourceKey] = {
        contributions: 0,
        withdrawals: 0,
      };
    }

    if (!runningPositions[key]) {
      runningPositions[key] = {
        shares: 0,
        costBasis: 0,
        realizedGainLoss: 0,
        firstBuyDate: null,
        lastSellDate: null
      };
    }
    const position = runningPositions[key];

    if (!timelineByDate.has(tx.date)) {
      timelineByDate.set(tx.date, {
        date: tx.date,
        contributions: 0,
        withdrawals: 0,
        transactions: [],
      });
    }
    const timelineEntry = timelineByDate.get(tx.date);
    timelineEntry.transactions.push(tx);

    // Track cash flows for all transactions
    // Note: Buy/Sell are now neutral - we focus on current holdings, not contribution tracking
    if (flowType === 'deposit' && magnitude > 0) {
      totals.contributions += magnitude;
      sourceCashFlows[sourceKey].contributions += magnitude;
      timelineEntry.contributions += magnitude;
    } else if (flowType === 'withdrawal' && magnitude > 0) {
      // Only count actual withdrawals, not transfers
      totalWithdrawals += magnitude;
      sourceCashFlows[sourceKey].withdrawals += magnitude;
      timelineEntry.withdrawals += magnitude;
    }
    // Note: 'neutral' flow type (Buy/Sell/transfers) don't affect cash flow totals


    if (Math.abs(units) > SHARE_EPSILON && units > 0) {
      // Buying shares
      const purchaseCost = amount !== 0
        ? Math.abs(amount)
        : Math.abs(units * ensureNumber(tx.unitPrice));
      position.costBasis += purchaseCost;
      position.shares += units;
      if (!position.firstBuyDate || tx.date < position.firstBuyDate) {
        position.firstBuyDate = tx.date;
      }
      const fundTotal = ensureFundTotals(fundTotals, tx.fund);
      if (!fundTotal.firstBuyDate || tx.date < fundTotal.firstBuyDate) {
        fundTotal.firstBuyDate = tx.date;
      }
    } else if (Math.abs(units) > SHARE_EPSILON && units < 0) {
      // Selling shares (negative units) - handle regardless of flow type
      const sharesToRemove = Math.abs(units);
      if (sharesToRemove > 0 && position.shares > SHARE_EPSILON) {
        const avgCost = position.costBasis / position.shares;
        const costReduction = avgCost * Math.min(sharesToRemove, position.shares);
        position.costBasis = Math.max(0, position.costBasis - costReduction);
        position.shares = Math.max(0, position.shares - sharesToRemove);

        // Calculate realized gain/loss for this sale
        // Sale proceeds (absolute amount) minus cost basis of shares sold
        const realized = Math.abs(amount) - costReduction;
        position.realizedGainLoss += realized;

        const fundTotal = ensureFundTotals(fundTotals, tx.fund);
        fundTotal.realizedGainLoss = (fundTotal.realizedGainLoss || 0) + realized;
        fundTotal.lastSellDate = tx.date;
        position.lastSellDate = tx.date;
      }
    } else if (flowType === 'deposit' && magnitude > 0 && Math.abs(units) <= SHARE_EPSILON) {
      // Cash contributions without share purchases - affects net invested but not cost basis
      // Cost basis should only reflect the cost of actual shares purchased
      if (!position.firstBuyDate || tx.date < position.firstBuyDate) {
        position.firstBuyDate = tx.date;
      }
      const fundTotal = ensureFundTotals(fundTotals, tx.fund);
      if (!fundTotal.firstBuyDate || tx.date < fundTotal.firstBuyDate) {
        fundTotal.firstBuyDate = tx.date;
      }
    }
  }

  totals.netInvested = totals.contributions - totalWithdrawals;

  const holdingsByFund = new Map();
  let runningInvested = 0;
  let runningCostBasis = 0;
  const timeline = Array.from(timelineByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => {
      for (const tx of entry.transactions) {
        const amount = ensureNumber(tx.amount);
        const units = ensureNumber(tx.units);
        const flowType = classifyFlow(tx.activity);
        const magnitude = Math.abs(amount);

        if (flowType === 'deposit' && magnitude > 0) {
          runningInvested += magnitude;
        } else if (flowType === 'withdrawal' && magnitude > 0) {
          runningInvested -= magnitude;
        }

        const holding = holdingsByFund.get(tx.fund) || { shares: 0, costBasis: 0, latestNav: 0 };

        // Track cost basis
        if (units > 0) {
          // Buying shares - add to cost basis
          const purchaseCost = magnitude > 0 ? magnitude : Math.abs(units * ensureNumber(tx.unitPrice));
          holding.costBasis += purchaseCost;
          runningCostBasis += purchaseCost;
        } else if (units < 0 && holding.shares > 0) {
          // Selling shares - reduce cost basis proportionally
          const avgCost = holding.costBasis / holding.shares;
          const costReduction = avgCost * Math.min(Math.abs(units), holding.shares);
          holding.costBasis = Math.max(0, holding.costBasis - costReduction);
          runningCostBasis = Math.max(0, runningCostBasis - costReduction);
        }

        holding.shares += units;
        if (Number.isFinite(tx.unitPrice) && tx.unitPrice > 0) {
          holding.latestNav = tx.unitPrice;
        }
        holdingsByFund.set(tx.fund, holding);
      }

      const marketValue = Array.from(holdingsByFund.values()).reduce((sum, holding) => {
        const shares = ensureNumber(holding.shares);
        const nav = Number.isFinite(holding.latestNav) ? holding.latestNav : 0;
        return sum + shares * nav;
      }, 0);

      const withdrawals = entry.withdrawals || 0;
      const net = entry.contributions - withdrawals;

      return {
        date: entry.date,
        contributions: entry.contributions,
        withdrawals,
        net,
        balance: runningInvested,
        investedBalance: runningInvested,
        costBasis: runningCostBasis,
        marketValue,
        transactions: entry.transactions ? entry.transactions.map(tx => ({ ...tx })) : [],
      };
    });

  const payPeriodDates = new Set();

  // First pass: calculate latest NAV per fund (across all sources)
  // Use live prices if available, otherwise fall back to transaction NAV
  const latestNAVByFund = new Map();
  for (const [key, entries] of byFundSource.entries()) {
    const [fund, moneySource] = key.split('||');

    // Check if we have a live price for this fund
    let nav = 0;
    let priceSource = 'transaction';

    if (livePrices && livePrices[fund] && livePrices[fund].price > 0) {
      // Use live price from API
      nav = livePrices[fund].price;
      priceSource = 'live';
      console.log(`📈 Using live price for ${fund}: $${nav.toFixed(2)}`);

      // Track the price timestamp for this money source
      if (!priceTimestamps[moneySource]) {
        priceTimestamps[moneySource] = {
          timestamp: livePrices[fund].updatedAt,
          source: priceSource
        };
      }
    } else {
      // Fall back to latest transaction price
      nav = latestNavFor(entries);
      priceSource = 'transaction';

      // For transaction-based prices, use the most recent transaction date for this source
      const latestTx = entries[entries.length - 1];
      if (latestTx && (!priceTimestamps[moneySource] || latestTx.date > priceTimestamps[moneySource].timestamp)) {
        priceTimestamps[moneySource] = {
          timestamp: latestTx.date,
          source: priceSource
        };
      }
    }

    // Keep the most recent NAV for this fund
    if (!latestNAVByFund.has(fund) || nav > 0) {
      latestNAVByFund.set(fund, { price: nav, source: priceSource });
    }
  }

  for (const [key, entries] of byFundSource.entries()) {
    const [fund, source] = key.split('||');
    const position = runningPositions[key] || { shares: 0, costBasis: 0, realizedGainLoss: 0, firstBuyDate: null, lastSellDate: null };
    let shares = position.shares;
    const costBasis = Math.max(position.costBasis, 0);
    const isClosed = Math.abs(shares) < SHARE_EPSILON;
    if (isClosed) {
      shares = 0;
    }
    const avgCost = shares ? costBasis / shares : 0;
    const navData = latestNAVByFund.get(fund) || { price: 0, source: 'transaction' };
    const latestNAV = navData.price; // Extract price from object
    const priceSource = navData.source; // Track whether this is live or transaction price
    const marketValue = shares * latestNAV;
    let gainLoss = marketValue - costBasis;
    const realizedGainLoss = position.realizedGainLoss || 0;

    // For closed positions, use realized gain/loss and include it in market value calculation
    if (isClosed) {
      gainLoss = realizedGainLoss;
      // If position is closed but has realized gains, reflect that in the market value
      if (Math.abs(realizedGainLoss) > SHARE_EPSILON) {
        // Keep the realized gains visible by setting a nominal market value
        // This helps track performance of closed positions
      }
    }

    const firstBuyDate = position.firstBuyDate;
    const lastSellDate = position.lastSellDate;

    if (!portfolio[fund]) {
      portfolio[fund] = {};
    }
    portfolio[fund][source] = {
      shares,
      costBasis,
      avgCost,
      latestNAV,
      marketValue,
      gainLoss,
      isClosed,
      firstBuyDate,
      lastSellDate,
      realizedGainLoss,
      priceSource, // 'live' or 'transaction'
      // Additional metadata for better tracking
      totalSaleProceeds: isClosed ? Math.abs(realizedGainLoss + costBasis) : 0,
      hasTransactions: entries.length > 0
    };

    totals.shares += shares;
    totals.costBasis += costBasis;

    // Separate unrealized vs realized gains and market value
    if (isClosed) {
      totals.realizedGainLoss += realizedGainLoss || 0;
      totals.gainLoss += realizedGainLoss || 0; // Add realized gains to total
      // Don't include closed positions in market value
    } else {
      totals.unrealizedGainLoss += gainLoss;
      totals.gainLoss += gainLoss; // Add unrealized gains to total
      // Only include open positions in market value
      totals.marketValue += marketValue;
    }

    const fundTotal = ensureFundTotals(fundTotals, fund);
    fundTotal.shares += shares;
    fundTotal.costBasis += costBasis;
    // Only include market value for open positions
    if (!isClosed) {
      fundTotal.marketValue += marketValue;
    }
    fundTotal.gainLoss += gainLoss;

    const sourceKey = source || 'Unknown';
    if (!sourceTotals[sourceKey]) {
      sourceTotals[sourceKey] = {
        shares: 0,
        costBasis: 0,
        marketValue: 0,
        gainLoss: 0,
        avgCost: 0,
        contributions: 0,
        netInvested: 0,
        roi: 0,
      };
    }
    const sourceTotal = sourceTotals[sourceKey];
    sourceTotal.shares += shares;
    sourceTotal.costBasis += costBasis;
    // Only include market value for open positions
    if (!isClosed) {
      sourceTotal.marketValue += marketValue;
    }
    sourceTotal.gainLoss += gainLoss;
  }

  for (const [sourceKey, flows] of Object.entries(sourceCashFlows)) {
    if (!sourceTotals[sourceKey]) {
      sourceTotals[sourceKey] = {
        shares: 0,
        costBasis: 0,
        marketValue: 0,
        gainLoss: 0,
        avgCost: 0,
        contributions: 0,
        netInvested: 0,
        roi: 0,
      };
    }
    const entry = sourceTotals[sourceKey];
    entry.contributions += flows.contributions;
    const withdrawalsForSource = flows.withdrawals || 0;
    entry.netInvested = entry.contributions - withdrawalsForSource;
  }

  for (const sourceEntry of Object.values(sourceTotals)) {
    if (Math.abs(sourceEntry.shares) < SHARE_EPSILON) {
      sourceEntry.shares = 0;
    }
    sourceEntry.avgCost = sourceEntry.shares ? sourceEntry.costBasis / sourceEntry.shares : 0;
    sourceEntry.roi = sourceEntry.netInvested
      ? (sourceEntry.marketValue - sourceEntry.netInvested) / sourceEntry.netInvested
      : 0;
  }

  totals.roi = totals.netInvested ? totals.gainLoss / totals.netInvested : 0;

  for (const entry of timeline) {
    if (entry.contributions > 0) {
      payPeriodDates.add(entry.date);
    }
  }

  totals.payPeriods = payPeriodDates.size;

  // Separate open and closed positions for UI
  const openPositions = {};
  const closedPositions = {};

  Object.entries(portfolio).forEach(([fund, sources]) => {
    Object.entries(sources).forEach(([source, position]) => {
      if (position.isClosed) {
        if (!closedPositions[fund]) closedPositions[fund] = {};
        closedPositions[fund][source] = position;
      } else {
        if (!openPositions[fund]) openPositions[fund] = {};
        openPositions[fund][source] = position;
      }
    });
  });

  // Calculate totals for each category
  const openPositionsTotals = {
    shares: 0,
    costBasis: 0,
    marketValue: 0,
    gainLoss: 0
  };

  const closedPositionsTotals = {
    realizedGainLoss: 0,
    count: 0
  };

  Object.values(openPositions).forEach(sources => {
    Object.values(sources).forEach(position => {
      openPositionsTotals.shares += position.shares || 0;
      openPositionsTotals.costBasis += position.costBasis || 0;
      openPositionsTotals.marketValue += position.marketValue || 0;
      openPositionsTotals.gainLoss += position.gainLoss || 0;
    });
  });

  Object.values(closedPositions).forEach(sources => {
    Object.values(sources).forEach(position => {
      closedPositionsTotals.realizedGainLoss += position.realizedGainLoss || 0;
      closedPositionsTotals.count += 1;
    });
  });





  return {
    portfolio,
    openPositions,
    closedPositions,
    openPositionsTotals,
    closedPositionsTotals,
    totals,
    fundTotals,
    sourceTotals,
    timeline,
    firstTransaction,
    lastUpdated,
    priceTimestamps,
  };
}
