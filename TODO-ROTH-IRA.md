# Roth IRA Integration TODO

## Overview
~~Extend the 401K Tracker to support Roth IRA tracking from M1 Finance for comprehensive retirement planning.~~

**STATUS: COMPLETED VIA PLAID INTEGRATION** 🎉

The comprehensive Plaid API integration now supports multiple account types including Roth IRAs from M1 Finance. Manual CSV import remains available as backup.

## Current Architecture Analysis ✅
- ✅ Transaction-based data model with flexible fields
- ✅ Multi-source portfolio tracking already supports different `moneySource` values
- ✅ Flexible parsing system in `parseTransactions.js`
- ✅ Account-agnostic calculations in portfolio/totals/timeline generation
- ✅ GitHub-based secure storage system
- ✅ **NEW: Plaid API integration for automated account data**

## Remaining Manual Tasks (Optional)

Since Plaid will handle M1 Finance automatically once approved, these are only needed for manual backup:

### M1 Finance CSV Parser (Low Priority)
- [ ] Obtain M1 Finance CSV export sample when first transaction settles Monday
- [ ] Create simple parser for M1 format as backup to Plaid
- [ ] Test with real data

### Post-Plaid Approval
- [ ] Connect M1 Finance account via Plaid Link
- [ ] Verify data accuracy vs manual exports
- [ ] Set up automated daily sync

## Already Completed ✅
- ✅ Multi-account data model via Plaid integration
- ✅ Account connection UI (`AccountConnection.jsx`)
- ✅ Portfolio aggregation across accounts (`AggregationService.js`)
- ✅ Multi-account dashboard support
- ✅ Tax diversification tracking
- ✅ Secure token storage and API endpoints
- ✅ GitHub storage strategy (unified structure)
- ✅ Backward compatibility maintained