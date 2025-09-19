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
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const FUND_NAME_OVERRIDES = {
  '0899 Vanguard 500 Index Fund Adm': 'Vanguard 500',
};

const SOURCE_NAME_OVERRIDES = {
  'Safe Harbor Match': 'Match',
  'Employee PreTax': 'Traditional',
  'Employee Post Tax': 'Roth',
};

export function formatFundName(name) {
  if (!name) return 'Unknown';
  return FUND_NAME_OVERRIDES[name] || name;
}

export function formatSourceName(name) {
  if (!name) return 'Unknown';
  return SOURCE_NAME_OVERRIDES[name] || name;
}
