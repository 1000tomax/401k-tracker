# Roth IRA Integration TODO

## Overview
Extend the 401K Tracker to support Roth IRA tracking from M1 Finance for comprehensive retirement planning.

## Current Architecture Analysis ✅
- Transaction-based data model with flexible fields
- Multi-source portfolio tracking already supports different `moneySource` values
- Flexible parsing system in `parseTransactions.js`
- Account-agnostic calculations in portfolio/totals/timeline generation
- GitHub-based secure storage system

## Phase 1: Data Model Extension
- [ ] Add `accountType` field to transaction schema (`401k`, `roth-ira`)
- [ ] Update `TransactionSchema` in `src/utils/schemas.js`
- [ ] Modify `SnapshotSchema` to support account-level data organization
- [ ] Update storage structure to handle multiple account types
- [ ] Ensure backward compatibility with existing 401k data

## Phase 2: M1 Finance Parser
- [ ] **BLOCKED**: Obtain M1 Finance export samples to understand format
- [ ] Analyze M1 CSV/export structure and field mappings
- [ ] Create `parseM1Transactions.js` utility
- [ ] Map M1 transaction types to our activity system:
  - Buy/Sell orders
  - Dividend reinvestment
  - Deposits/Withdrawals
  - Rebalancing activities
- [ ] Handle M1-specific fund naming conventions
- [ ] Test parser with sample M1 data

## Phase 3: Multi-Account Dashboard
- [ ] Add account type selector/tabs to main interface
- [ ] Create account filter in `Dashboard.jsx`
- [ ] Extend `calculateSummary` to support:
  - Account-specific totals
  - Combined retirement view
  - Account-level timeline data
- [ ] Update charts to show:
  - Individual account progress
  - Combined retirement trajectory
  - Account allocation breakdown

## Phase 4: Enhanced Portfolio Management
- [ ] Group funds by account type in `PortfolioTable.jsx`
- [ ] Add account-specific sections to portfolio display
- [ ] Implement retirement planning metrics:
  - Traditional vs Roth balance allocation
  - Tax diversification tracking
  - Contribution limit monitoring
- [ ] Create account summary cards

## Phase 5: Import Enhancement
- [ ] Add M1 Finance import option to `Import.jsx`
- [ ] Support multiple file uploads for different accounts
- [ ] Add account type selection during import
- [ ] Update file validation for M1 formats
- [ ] Maintain transaction deduplication across accounts

## Phase 6: Storage & Sync
- [ ] Decide on GitHub storage strategy:
  - Option A: Separate files per account type
  - Option B: Unified structure with account tagging
- [ ] Update API endpoints to handle multi-account data
- [ ] Ensure sync maintains data integrity across accounts
- [ ] Update backup/restore functionality

## Phase 7: UI/UX Enhancements
- [ ] Design account switcher interface
- [ ] Create retirement planning dashboard
- [ ] Add combined portfolio views
- [ ] Implement account-specific styling/branding
- [ ] Add tooltips explaining traditional vs Roth differences

## Phase 8: Advanced Features (Future)
- [ ] Tax optimization suggestions
- [ ] Rebalancing recommendations across accounts
- [ ] Retirement goal tracking
- [ ] Asset allocation analysis
- [ ] Support for additional account types (Traditional IRA, etc.)

## Technical Considerations
- Maintain backward compatibility with existing 401k data
- Ensure all calculations work correctly with multiple account types
- Keep GitHub integration secure and efficient
- Consider performance impact of larger datasets
- Plan for easy addition of more account types in the future

## Dependencies
- **CRITICAL**: Need M1 Finance export samples to proceed with parser development
- May need to update environment variables for multi-account storage paths
- Consider if new GitHub repository structure is needed

## Notes
- Current 401k functionality should remain completely unchanged
- All new features should be additive, not disruptive
- Focus on unified retirement planning view as the key value proposition