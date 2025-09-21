export const ACCOUNT_TYPES = {
  TRADITIONAL_401K: 'traditional_401k',
  ROTH_IRA: 'roth_ira'
};

export const ACCOUNT_PROVIDERS = {
  VOYA: 'voya',
  M1: 'm1',
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
    [ACCOUNT_TYPES.ROTH_IRA]: '#22c55e'         // Green
  };
  return colors[accountType] || '#6b7280';
}