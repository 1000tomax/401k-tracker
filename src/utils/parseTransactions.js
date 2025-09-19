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

function smartSplit(line) {
  if (line.includes('\t')) {
    return line.split('\t').map(part => part.trim()).filter(Boolean);
  }

  const multiSpaceParts = line
    .split(/\s{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
  if (multiSpaceParts.length >= 6) {
    return multiSpaceParts;
  }

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
  if (!rawText) return [];

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

    const normalizedActivity = (activity || 'Unknown Activity').trim() || 'Unknown Activity';
    const moneySource = (moneySourceRaw || 'Unknown').trim() || 'Unknown';

    const unitPrice = toNumber(unitPriceStr);
    const rawUnits = toNumber(unitsStr);
    const isTransferOut = /transfer\s*out/i.test(normalizedActivity);

    let finalUnits = isTransferOut ? -Math.abs(rawUnits) : Math.abs(rawUnits);
    if (!Number.isFinite(finalUnits)) {
      finalUnits = 0;
    }

    let amount = hasAmountField ? toNumber(amountStr) : rawUnits * unitPrice;
    if (!Number.isFinite(amount)) {
      amount = finalUnits * unitPrice;
    }
    if (!Number.isFinite(amount)) {
      amount = 0;
    }

    if (finalUnits < 0 && amount > 0) {
      amount = -Math.abs(amount);
    }
    if (finalUnits >= 0 && amount < 0) {
      amount = Math.abs(amount);
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

export function aggregatePortfolio(transactions) {
  const portfolio = {};
  const totals = {
    shares: 0,
    costBasis: 0,
    marketValue: 0,
    gainLoss: 0,
    contributions: 0,
    netInvested: 0,
  };
  let totalWithdrawals = 0;
  const fundTotals = {};
  const sourceTotals = {};
  const sourceCashFlows = {};
  const byFundSource = new Map();
  const timelineByDate = new Map();

  const chronological = [...transactions]
    .filter(tx => tx && tx.date && tx.fund)
    .sort((a, b) => a.date.localeCompare(b.date));

  let lastUpdated = null;
  let firstTransaction = null;

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

    const amount = ensureNumber(tx.amount);
    if (amount >= 0) {
      totals.contributions += amount;
    } else {
      totalWithdrawals += Math.abs(amount);
    }

    const sourceKey = tx.moneySource || 'Unknown';
    if (!sourceCashFlows[sourceKey]) {
      sourceCashFlows[sourceKey] = {
        contributions: 0,
        withdrawals: 0,
      };
    }
    if (amount >= 0) {
      sourceCashFlows[sourceKey].contributions += amount;
    } else {
      sourceCashFlows[sourceKey].withdrawals += Math.abs(amount);
    }

    let timelineEntry = timelineByDate.get(tx.date);
    if (!timelineEntry) {
      timelineEntry = {
        date: tx.date,
        contributions: 0,
        withdrawals: 0,
        net: 0,
      };
      timelineByDate.set(tx.date, timelineEntry);
    }
    if (amount >= 0) {
      timelineEntry.contributions += amount;
    } else {
      timelineEntry.withdrawals += Math.abs(amount);
    }
    timelineEntry.net = timelineEntry.contributions - timelineEntry.withdrawals;
  }

  totals.netInvested = totals.contributions - totalWithdrawals;

  const timeline = Array.from(timelineByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => ({
      date: entry.date,
      contributions: entry.contributions,
      net: entry.contributions - entry.withdrawals,
    }));
  let runningBalance = 0;
  for (const entry of timeline) {
    runningBalance += entry.net;
    entry.balance = runningBalance;
  }

  for (const [key, entries] of byFundSource.entries()) {
    const [fund, source] = key.split('||');
    const shares = entries.reduce((sum, entry) => sum + ensureNumber(entry.units), 0);
    const costBasis = entries.reduce((sum, entry) => sum + ensureNumber(entry.amount), 0);
    const avgCost = shares ? costBasis / shares : 0;
    const latestNAV = latestNavFor(entries);
    const marketValue = shares * latestNAV;
    const gainLoss = marketValue - costBasis;

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
    };

    totals.shares += shares;
    totals.costBasis += costBasis;
    totals.marketValue += marketValue;
    totals.gainLoss += gainLoss;

    const fundTotal = ensureFundTotals(fundTotals, fund);
    fundTotal.shares += shares;
    fundTotal.costBasis += costBasis;
    fundTotal.marketValue += marketValue;
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
    sourceTotal.marketValue += marketValue;
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
    sourceEntry.avgCost = sourceEntry.shares ? sourceEntry.costBasis / sourceEntry.shares : 0;
    sourceEntry.roi = sourceEntry.netInvested
      ? (sourceEntry.marketValue - sourceEntry.netInvested) / sourceEntry.netInvested
      : 0;
  }

  totals.roi = totals.netInvested ? totals.gainLoss / totals.netInvested : 0;

  return {
    portfolio,
    totals,
    fundTotals,
    sourceTotals,
    timeline,
    firstTransaction,
    lastUpdated,
  };
}
