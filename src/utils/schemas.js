import { z } from 'zod';

// Hardcoded account types to avoid serverless import issues
const ACCOUNT_TYPE_VALUES = [
  'traditional_401k',
  'roth_401k',
  'traditional_ira',
  'roth_ira',
  'taxable_brokerage',
  'hsa'
];

const ACCOUNT_PROVIDER_VALUES = [
  'voya',
  'm1_finance',
  'plaid',
  'other'
];

// Enhanced transaction schema for multi-account support (backward compatible)
export const TransactionSchema = z
  .object({
    // Existing fields (preserve compatibility)
    date: z.string().min(1),
    activity: z.string().min(1),
    fund: z.string().min(1),
    moneySource: z.string().optional(),
    source: z.string().optional(),
    units: z.number(),
    unitPrice: z.number(),
    amount: z.number(),
    shares: z.number().optional(),
    id: z.string().optional(),
    notes: z.string().optional(),

    // New fields for multi-account support
    accountType: z.enum(ACCOUNT_TYPE_VALUES).optional(),
    accountId: z.string().optional(),
    provider: z.enum(ACCOUNT_PROVIDER_VALUES).optional(),
    symbol: z.string().optional(),
    securityId: z.string().optional(),

    // Metadata
    importSource: z.enum(['csv', 'plaid', 'manual']).optional(),
    importedAt: z.string().optional(),
    rawData: z.record(z.any()).optional()
  })
  .passthrough();

// Security/Holding schema
export const SecuritySchema = z.object({
  securityId: z.string(),
  symbol: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  closePrice: z.number().optional(),
  isoCode: z.string().default('USD'),
  lastUpdated: z.string().optional()
});

export const HoldingSchema = z.object({
  accountId: z.string(),
  securityId: z.string(),
  symbol: z.string().optional(),
  name: z.string(),
  quantity: z.number(),
  institutionPrice: z.number(),
  institutionValue: z.number(),
  costBasis: z.number().optional(),

  // Live market data
  livePrice: z.number().optional(),
  liveValue: z.number().optional(),
  priceChange: z.number().optional(),
  priceChangePercent: z.string().optional(),
  lastPriceUpdate: z.string().optional(),

  // Calculated values
  unrealizedGainLoss: z.number().optional(),
  unrealizedGainLossPercent: z.number().optional()
});

// Account schema
export const AccountSchema = z.object({
  accountId: z.string(),
  itemId: z.string().optional(),
  name: z.string(),
  officialName: z.string().optional(),
  type: z.string(),
  subtype: z.string().optional(),

  // Classification
  accountType: z.enum(ACCOUNT_TYPE_VALUES),
  provider: z.enum(ACCOUNT_PROVIDER_VALUES),

  // Balances
  balances: z.object({
    available: z.number().optional(),
    current: z.number(),
    isoCurrencyCode: z.string().default('USD'),
    limit: z.number().optional(),
    unofficial: z.number().optional()
  }),

  // Holdings and transactions
  holdings: z.array(HoldingSchema).optional(),
  transactions: z.array(TransactionSchema).optional(),

  // Contribution tracking
  contributionTracking: z.object({
    currentYearContributions: z.number().default(0),
    contributionLimit: z.number().optional(),
    remainingContributionRoom: z.number().optional(),
    lastContributionDate: z.string().optional()
  }).optional(),

  // Metadata
  lastSyncAt: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error']).default('active'),
  errors: z.array(z.string()).optional()
});

// Multi-account portfolio schema
export const MultiAccountPortfolioSchema = z.object({
  version: z.string().default('2.1'),

  // Individual accounts
  accounts: z.record(AccountSchema),

  // Securities reference
  securities: z.record(SecuritySchema).optional(),

  // Consolidated totals
  consolidatedTotals: z.object({
    totalValue: z.number(),
    totalContributions: z.number(),
    totalEarnings: z.number(),
    totalUnrealizedGainLoss: z.number(),
    accountCount: z.number(),
    lastUpdated: z.string()
  }),

  // Breakdown by account type
  byAccountType: z.record(z.object({
    totalValue: z.number(),
    totalContributions: z.number(),
    totalEarnings: z.number(),
    accountCount: z.number(),
    accounts: z.array(z.string()) // Account IDs
  })),

  // Asset allocation across all accounts
  assetAllocation: z.object({
    byAssetClass: z.record(z.object({
      value: z.number(),
      percentage: z.number(),
      holdings: z.array(z.string()) // Security IDs
    })).optional(),

    byAccountType: z.record(z.object({
      value: z.number(),
      percentage: z.number()
    })),

    taxDiversification: z.object({
      preTax: z.object({
        value: z.number(),
        percentage: z.number()
      }),
      postTax: z.object({
        value: z.number(),
        percentage: z.number()
      }),
      taxable: z.object({
        value: z.number(),
        percentage: z.number()
      }),
      hsa: z.object({
        value: z.number(),
        percentage: z.number()
      }).optional()
    })
  }).optional(),

  // Data sources and sync info
  dataSources: z.object({
    manual: z.object({
      enabled: z.boolean(),
      lastImport: z.string().optional(),
      transactionCount: z.number().default(0)
    }),

    plaid: z.object({
      enabled: z.boolean(),
      connectedAccounts: z.array(z.string()),
      lastSync: z.string().optional(),
      errors: z.array(z.string()).optional()
    }),

    livePrices: z.object({
      enabled: z.boolean(),
      lastUpdate: z.string().optional(),
      symbolCount: z.number().default(0),
      errors: z.array(z.string()).optional()
    })
  }),

  // Settings and preferences
  settings: z.object({
    multiAccountMode: z.boolean().default(false),
    defaultView: z.enum(['consolidated', 'by_account_type', 'individual']).default('consolidated'),
    userAge: z.number().optional(),
    filingStatus: z.enum(['single', 'married_joint', 'married_separate', 'head_of_household']).optional()
  }).optional()
});

// Legacy snapshot schema (backward compatible) - simplified for serverless
export const SnapshotSchema = z
  .object({
    transactions: z.array(z.any()), // Simplified to avoid enum validation issues
    portfolio: z.any().optional(),
    totals: z.any().optional(),
    fundTotals: z.any().optional(),
    sourceTotals: z.any().optional(),
    timeline: z.any().optional(),
    lastUpdated: z.string().optional(),
    generatedAt: z.string().optional(),
    syncedAt: z.string().optional(),
  })
  .passthrough();

// Union schema for handling both legacy and new formats
export const PortfolioSchema = z.union([
  MultiAccountPortfolioSchema,
  SnapshotSchema
]);

// Helper functions for schema validation and migration

export function validatePortfolioData(data) {
  try {
    return PortfolioSchema.parse(data);
  } catch (error) {
    console.error('Portfolio data validation failed:', error);
    throw new Error(`Invalid portfolio data: ${error.message}`);
  }
}

export function isLegacyFormat(data) {
  return data.version === '1.0' || (!data.version && data.transactions && Array.isArray(data.transactions));
}

export function migrateLegacyToMultiAccount(legacyData) {
  if (!isLegacyFormat(legacyData)) {
    return legacyData;
  }

  const defaultAccountId = 'legacy_401k_account';
  const defaultAccount = {
    accountId: defaultAccountId,
    name: 'Legacy 401(k) Account',
    type: 'investment',
    subtype: '401k',
    accountType: 'traditional_401k',
    provider: 'other',
    balances: {
      current: legacyData.totals?.marketValue || 0,
      isoCurrencyCode: 'USD'
    },
    holdings: [],
    transactions: legacyData.transactions || [],
    status: 'active',
    lastSyncAt: legacyData.lastSyncAt
  };

  // Convert portfolio holdings to new format
  if (legacyData.portfolio) {
    const holdings = [];
    Object.entries(legacyData.portfolio).forEach(([fund, sources]) => {
      Object.entries(sources).forEach(([source, metrics]) => {
        holdings.push({
          accountId: defaultAccountId,
          securityId: `${fund}_${source}`,
          symbol: fund.replace(/[^A-Z0-9]/gi, '').substring(0, 5),
          name: fund,
          quantity: metrics.shares || 0,
          institutionPrice: metrics.latestNAV || 0,
          institutionValue: metrics.marketValue || 0,
          costBasis: metrics.costBasis || 0,
          unrealizedGainLoss: metrics.gainLoss || 0,
          unrealizedGainLossPercent: metrics.roi || 0
        });
      });
    });
    defaultAccount.holdings = holdings;
    defaultAccount.totalValue = legacyData.totals?.marketValue || 0;
    defaultAccount.totalContributions = legacyData.totals?.contributions || legacyData.totals?.netInvested || 0;
    defaultAccount.totalEarnings = legacyData.totals?.gainLoss || 0;
    defaultAccount.lastProcessed = new Date().toISOString();
    defaultAccount.holdingsCount = holdings.length;
  }

  const migratedData = {
    version: '2.1',
    accounts: {
      [defaultAccountId]: defaultAccount
    },
    consolidatedTotals: {
      totalValue: legacyData.totals?.marketValue || 0,
      totalContributions: legacyData.totals?.contributions || legacyData.totals?.netInvested || 0,
      totalEarnings: legacyData.totals?.gainLoss || 0,
      totalUnrealizedGainLoss: legacyData.totals?.gainLoss || 0,
      accountCount: 1,
      lastUpdated: new Date().toISOString()
    },
    byAccountType: {
      'traditional_401k': {
        totalValue: legacyData.totals?.marketValue || 0,
        totalContributions: legacyData.totals?.contributions || legacyData.totals?.netInvested || 0,
        totalEarnings: legacyData.totals?.gainLoss || 0,
        accountCount: 1,
        accounts: [defaultAccountId]
      }
    },
    dataSources: {
      manual: {
        enabled: true,
        transactionCount: legacyData.transactions?.length || 0,
        lastImport: legacyData.lastSyncAt
      },
      plaid: {
        enabled: false,
        connectedAccounts: []
      },
      livePrices: {
        enabled: false,
        symbolCount: 0
      }
    },
    settings: {
      multiAccountMode: false,
      defaultView: 'consolidated'
    }
  };

  return MultiAccountPortfolioSchema.parse(migratedData);
}

export function validateAndMigratePortfolio(data) {
  if (isLegacyFormat(data)) {
    return migrateLegacyToMultiAccount(data);
  }
  return validatePortfolioData(data);
}
