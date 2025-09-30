export function formatCurrency(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatShares(value) {
  if (!Number.isFinite(value)) return '0.000';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatUnitPrice(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDate(value) {
  if (!value) return '—';

  // Parse as UTC date, then convert to local timezone for display
  let date;
  if (value.includes('T')) {
    // Already has time component (ISO format)
    date = new Date(value);
  } else {
    // Date only - parse as UTC midnight then display in local timezone
    date = new Date(`${value}T00:00:00Z`);
  }

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

const FUND_NAME_OVERRIDES = {
  '0899 Vanguard 500 Index Fund Adm': 'Vanguard 500',
};

const SOURCE_NAME_OVERRIDES = {
  'Safe Harbor Match': 'Match',
  'Employee PreTax': 'Traditional',
  'Employee Post Tax': 'Roth',
  'She Roth on that thing til i IRA': 'Roth IRA',
};

export function formatFundName(name) {
  if (!name) return 'Unknown';
  return FUND_NAME_OVERRIDES[name] || name;
}

export function formatSourceName(name) {
  if (!name) return 'Unknown';
  return SOURCE_NAME_OVERRIDES[name] || name;
}
