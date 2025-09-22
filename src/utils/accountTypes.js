export const ACCOUNT_TYPES = {
  TRADITIONAL_401K: 'traditional_401k',
  ROTH_IRA: 'roth_ira',
  TAXABLE_BROKERAGE: 'taxable_brokerage',
  TRADITIONAL_IRA: 'traditional_ira',
  HSA: 'hsa'
};

export const ACCOUNT_PROVIDERS = {
  VOYA: 'voya',
  M1_FINANCE: 'm1_finance',
  OTHER: 'other'
};

export const ACCOUNT_RULES = {
  [ACCOUNT_TYPES.TRADITIONAL_401K]: {
    name: 'Traditional 401(k)',
    taxTreatment: 'pre_tax'
  },
  [ACCOUNT_TYPES.ROTH_IRA]: {
    name: 'Roth IRA',
    taxTreatment: 'post_tax'
  },
  [ACCOUNT_TYPES.TAXABLE_BROKERAGE]: {
    name: 'Taxable Brokerage',
    taxTreatment: 'taxable'
  },
  [ACCOUNT_TYPES.TRADITIONAL_IRA]: {
    name: 'Traditional IRA',
    taxTreatment: 'pre_tax'
  },
  [ACCOUNT_TYPES.HSA]: {
    name: 'HSA',
    taxTreatment: 'tax_free'
  }
};

// Utility functions
export function formatAccountTypeName(accountType) {
  const rules = ACCOUNT_RULES[accountType];
  return rules ? rules.name : accountType.replace(/_/g, ' ').toUpperCase();
}

export function getAccountTypeColor(accountType) {
  const colors = {
    [ACCOUNT_TYPES.TRADITIONAL_401K]: '#3b82f6', // Blue
    [ACCOUNT_TYPES.ROTH_IRA]: '#22c55e',         // Green
    [ACCOUNT_TYPES.TAXABLE_BROKERAGE]: '#f59e0b', // Amber
    [ACCOUNT_TYPES.TRADITIONAL_IRA]: '#8b5cf6',   // Purple
    [ACCOUNT_TYPES.HSA]: '#06b6d4'               // Cyan
  };
  return colors[accountType] || '#6b7280';
}