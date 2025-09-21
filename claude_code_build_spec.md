# Claude Code Build Specification: API-Based Investment Tracker

## Project Overview
Transform the existing manual CSV-based 401k tracker into a fully automated, API-driven investment tracking system. The current system is well-built and functional - we're enhancing it with Plaid API integration, real-time market data, and automated updates while preserving all existing functionality.

## Current System Analysis
- **Framework**: React 18 + Vite
- **Existing APIs**: `/api/snapshot.js`, `/api/push.js` for GitHub sync
- **Components**: Dashboard, Import, SummaryOverview, PortfolioTable
- **Data Flow**: Manual CSV → Local Storage → GitHub backup
- **Styling**: Custom CSS with clean design system

## Build Requirements

### Phase 1: Core API Integration (Priority: HIGH)

#### 1.1 Plaid Service Implementation
**File**: `src/services/PlaidClient.js`
```javascript
// REQUIRED: Full Plaid API client with these exact functions:
// - createLinkToken() 
// - exchangePublicToken(publicToken)
// - getAccounts(accessToken)
// - getHoldings(accessToken) 
// - getTransactions(accessToken, startDate, endDate)
// 
// CRITICAL: Use official plaid library, handle extensible enums
// CRITICAL: Include request_id tracking for all responses
// CRITICAL: Comprehensive error handling with error_code/error_type
```

**Configuration Requirements**:
- Support both sandbox and production environments
- Use environment variables: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
- Implement proper retry logic with exponential backoff
- Log all request_id values for debugging

#### 1.2 Market Data Service
**File**: `src/services/MarketDataService.js`
```javascript
// REQUIRED: Alpha Vantage integration with these functions:
// - getLivePrice(symbol)
// - getBatchPrices(symbols) with 12-second rate limiting
// - getMarketStatus() for Eastern Time market hours
//
// CRITICAL: Respect 5 calls/minute free tier limit
// CRITICAL: Handle API failures gracefully with cached fallbacks
```

**Rate Limiting Requirements**:
- Maximum 5 API calls per minute (12-second delays between calls)
- Batch processing for multiple symbols
- Error handling for quota exceeded scenarios

#### 1.3 API Endpoints
**File**: `api/plaid/create-link-token.js`
- POST endpoint for generating Plaid Link tokens
- Uses existing CORS and auth from current system
- Returns link_token for frontend Link component

**File**: `api/plaid/exchange-token.js` 
- POST endpoint for exchanging public_token for access_token
- Accepts account_type parameter (voya/m1)
- Returns access_token with storage instructions

**File**: `api/fetch-portfolio-data.js`
- POST endpoint for fetching all account data
- Combines Plaid data with live market prices
- Updates existing GitHub sync format

### Phase 2: Frontend Integration (Priority: HIGH)

#### 2.1 Account Connection Component
**File**: `src/components/AccountConnection.jsx`
```javascript
// REQUIRED: Complete Plaid Link integration
// - Uses react-plaid-link library
// - Handles full 4-step Link flow
// - Supports both Voya and M1 Finance connections
// - Clear error messaging and status updates
//
// INTEGRATION: Should work alongside existing Import.jsx page
```

**UI Requirements**:
- Follow existing design system and CSS patterns
- Clear instructions for supported account types
- Security messaging about Plaid bank-level security
- Success state with access token storage instructions

#### 2.2 Enhanced Dashboard
**File**: `src/pages/Dashboard.jsx` (enhance existing)
```javascript
// REQUIRED: Integrate live data without breaking existing functionality
// - Add live price overlays on existing portfolio display
// - Market status indicator (open/closed)
// - Last update timestamp for API data
// - Manual refresh button for on-demand updates
//
// CRITICAL: Preserve all existing manual CSV functionality
// CRITICAL: Use existing summary and portfolio components
```

**Enhancement Specifications**:
- Add `livePrices` prop to existing `PortfolioTable` component
- Include market status bar at top of dashboard
- Show combined data sources (manual + API) when both present
- Auto-refresh during market hours (5-minute intervals)

#### 2.3 Settings/Configuration Page
**File**: `src/pages/Settings.jsx` (new)
```javascript
// REQUIRED: API configuration and system status
// - Account connection status (connected/disconnected)
// - API usage statistics and cost tracking  
// - Manual refresh controls
// - System health indicators
//
// INTEGRATION: Add to existing router in App.jsx
```

### Phase 3: Automation (Priority: MEDIUM)

#### 3.1 GitHub Actions Workflow
**File**: `.github/workflows/daily-portfolio-update.yml`
```yaml
# REQUIRED: Automated daily data fetching
# - Runs weekdays at 10 AM EST (after market open)
# - Fetches data from all connected accounts
# - Updates GitHub data files
# - Commits changes automatically
#
# SECRETS NEEDED:
# - PLAID_CLIENT_ID
# - PLAID_SECRET  
# - PLAID_ACCESS_TOKEN_VOYA
# - PLAID_ACCESS_TOKEN_M1
# - ALPHA_VANTAGE_API_KEY
# - GITHUB_PAT (already exists)
```

#### 3.2 Update Script
**File**: `scripts/fetch-and-update.js`
```javascript
// REQUIRED: Standalone Node.js script for GitHub Actions
// - Fetches data from all configured Plaid accounts
// - Gets live market prices for all holdings
// - Saves data in existing GitHub format
// - Creates historical snapshots
//
// CRITICAL: Must work in GitHub Actions Node.js environment
// CRITICAL: Handle network failures and API errors gracefully
```

### Phase 4: Advanced Features (Priority: LOW)

#### 4.1 Data Aggregation Service
**File**: `src/services/AggregationService.js`
- Combine multiple account data into unified portfolio view
- Handle duplicate holdings across accounts
- Calculate total portfolio metrics

#### 4.2 Performance Analytics
**File**: `src/components/PerformanceAnalytics.jsx`
- Portfolio vs S&P 500 comparison
- Sector allocation analysis
- Return attribution (contributions vs market performance)

## Technical Requirements

### Dependencies to Install
```json
{
  "dependencies": {
    "plaid": "^latest",
    "react-plaid-link": "^latest", 
    "node-cron": "^latest",
    "date-fns": "^latest",
    "lodash": "^latest"
  }
}
```

### Environment Variables
```bash
# Existing (preserve these)
API_SHARED_TOKEN=existing-token
VITE_401K_TOKEN=existing-token
GITHUB_PAT=existing-pat
GITHUB_USERNAME=existing-username
GITHUB_REPO=existing-repo
GITHUB_BRANCH=main
GITHUB_DATA_PATH=data/401k-data.json

# New Plaid API
PLAID_CLIENT_ID=sandbox-client-id
PLAID_SECRET=sandbox-secret
PLAID_ENV=sandbox
PLAID_ACCESS_TOKEN_VOYA=  # Generated during account linking
PLAID_ACCESS_TOKEN_M1=    # Generated during account linking

# Market Data
ALPHA_VANTAGE_API_KEY=free-api-key

# Feature Flags
VITE_ENABLE_API_MODE=true
VITE_PLAID_ENV=sandbox
```

### File Structure (Additions to Existing)
```
/
├── src/
│   ├── components/ (existing)
│   │   ├── SummaryOverview.jsx (enhance with live prices)
│   │   ├── PortfolioTable.jsx (enhance with live prices)
│   │   ├── AccountConnection.jsx (new)
│   │   └── SystemStatus.jsx (new)
│   ├── pages/ (existing)
│   │   ├── Dashboard.jsx (enhance existing)
│   │   ├── Import.jsx (preserve existing)
│   │   └── Settings.jsx (new)
│   ├── services/ (new directory)
│   │   ├── PlaidClient.js
│   │   ├── MarketDataService.js
│   │   ├── AggregationService.js
│   │   └── ErrorService.js
│   └── utils/ (existing - enhance)
│       └── formatters.js (add live price formatters)
├── api/ (existing - add new endpoints)
│   ├── plaid/
│   │   ├── create-link-token.js
│   │   └── exchange-token.js
│   ├── fetch-portfolio-data.js
│   └── system-health.js
├── scripts/ (new)
│   └── fetch-and-update.js
└── .github/workflows/ (existing - add new)
    └── daily-portfolio-update.yml
```

### Integration Requirements

#### Data Format Compatibility
```javascript
// CRITICAL: Maintain compatibility with existing data format
const existingFormat = {
  version: "1.0",
  transactions: [...], // Existing manual CSV data
  portfolio: {...},    // Existing aggregated data
  totals: {...},       // Existing summary data
  // ... other existing fields
};

// REQUIRED: Extend format for API data
const enhancedFormat = {
  version: "2.0",
  // Preserve all existing fields
  ...existingFormat,
  
  // Add new API data fields
  apiData: {
    plaidAccounts: {...},
    livePrices: {...},
    lastAPISync: "2024-01-01T12:00:00Z"
  },
  dataSource: "hybrid", // "manual", "api", or "hybrid"
};
```

#### Component Enhancement Pattern
```javascript
// REQUIRED: Enhance existing components without breaking them
function EnhancedPortfolioTable({ 
  data,           // Existing manual data
  livePrices,     // New live price data
  showLivePrices = true  // Feature flag
}) {
  // Preserve all existing functionality
  // Add live price overlays when available
  // Show data source indicators
}
```

### Error Handling Requirements

#### Plaid Error Handling
```javascript
// CRITICAL: Handle all Plaid error codes properly
const PLAID_ERROR_CODES = {
  'ITEM_LOGIN_REQUIRED': 'Account re-authentication needed',
  'INSUFFICIENT_CREDENTIALS': 'Invalid login credentials',
  'RATE_LIMIT_EXCEEDED': 'API rate limit hit - retry later',
  'PRODUCT_NOT_SUPPORTED': 'Account type not supported',
  // ... handle all documented error codes
};

// REQUIRED: Log request_id for all errors
function handlePlaidError(error) {
  console.error('Plaid API Error:', {
    error_code: error.response?.data?.error_code,
    error_type: error.response?.data?.error_type,
    request_id: error.response?.data?.request_id,
    display_message: error.response?.data?.display_message
  });
}
```

#### Fallback Strategy
```javascript
// CRITICAL: Always preserve manual functionality
function getPortfolioData() {
  try {
    // Try API data first
    return await fetchAPIData();
  } catch (error) {
    console.warn('API fetch failed, using manual data:', error);
    // Fall back to existing manual data
    return getManualData();
  }
}
```

### Testing Requirements

#### Post-Implementation Testing (Human Required)
```javascript
// Claude Code CANNOT test these - requires real API credentials
// Human must test after implementation with sandbox credentials:
const SANDBOX_CREDENTIALS = {
  username: 'user_good',
  password: 'pass_good', 
  mfa: '1234'
};
```

#### API Testing Checklist (Human Testing Required)
After Claude Code implementation, human must validate:
- [ ] Account connection flow works in sandbox
- [ ] Data fetching returns proper format  
- [ ] Error handling works for all error types
- [ ] Rate limiting prevents quota exceeded
- [ ] GitHub sync preserves existing data format
- [ ] Manual import still works alongside API

#### Claude Code Deliverables (No Testing)
Claude Code will provide:
- [ ] Complete code implementation
- [ ] Proper API structure and error handling
- [ ] Integration with existing components
- [ ] Documentation for human testing
- [ ] Mock data for development without API calls

### Production Migration Checklist

#### Environment Switch
```javascript
// REQUIRED: Easy sandbox to production migration
const PLAID_CONFIG = {
  sandbox: {
    basePath: PlaidEnvironments.sandbox,
    credentials: 'user_good/pass_good'
  },
  production: {
    basePath: PlaidEnvironments.production,
    credentials: 'real account credentials required'
  }
};
```

#### Validation Requirements
- [ ] Compare API data accuracy vs manual CSV exports
- [ ] Monitor API costs and usage
- [ ] Verify all existing functionality preserved
- [ ] Test failover from API to manual methods

## Implementation Priority

### Must Have (Phase 1-2)
1. **Plaid sandbox integration** - Core API client and account linking
2. **Live price integration** - Real-time market data overlay
3. **Enhanced dashboard** - Integrate API data with existing UI
4. **API endpoints** - Data fetching and account management

### Should Have (Phase 3)
1. **Automated updates** - GitHub Actions daily sync
2. **System monitoring** - Health checks and error tracking
3. **Settings page** - API configuration management

### Nice to Have (Phase 4)  
1. **Advanced analytics** - Performance attribution and projections
2. **Multi-account aggregation** - Unified portfolio view
3. **Rebalancing suggestions** - Smart portfolio optimization

## Success Criteria

### Technical Success
- [ ] All existing manual CSV functionality preserved
- [ ] API data integrates seamlessly with current UI
- [ ] Automated updates work reliably via GitHub Actions
- [ ] Error handling prevents data loss or corruption
- [ ] System maintains <2 second load times

### User Experience Success
- [ ] Account connection process is intuitive
- [ ] Dashboard shows live data without breaking existing views
- [ ] Manual import remains available as backup
- [ ] Mobile experience works well for portfolio monitoring

### Business Success
- [ ] API costs stay under $2/month during development
- [ ] Data accuracy matches or exceeds manual methods
- [ ] System reliability >99% uptime
- [ ] Zero data loss during API migration

## Claude Code Specific Instructions

### Implementation Order
1. **Start with PlaidClient.js** - Get core API integration working
2. **Build API endpoints** - Create data fetching infrastructure  
3. **Enhance existing Dashboard** - Integrate live data
4. **Add AccountConnection component** - Enable account linking
5. **Create automation scripts** - GitHub Actions workflow
6. **Add monitoring and error handling** - Production readiness

### Code Quality Requirements
- Use existing code patterns and styling from current system
- Follow React functional component patterns already established
- Maintain TypeScript-like prop validation using existing patterns
- Use existing error handling and status message patterns
- Preserve all existing CSS classes and design system

### Testing Strategy
- Test all API integrations in Plaid sandbox first
- Validate data format compatibility with existing system
- Ensure graceful degradation when API is unavailable
- Test mobile responsiveness matches existing components

Ready for Claude Code implementation! The current system is solid and this spec preserves everything while adding powerful automation.