# Testing Guide

This document provides comprehensive guidelines for testing the 401k Tracker application.

## Table of Contents

- [Overview](#overview)
- [Testing Stack](#testing-stack)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Structure](#test-structure)
- [Coverage Requirements](#coverage-requirements)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

## Overview

The 401k Tracker application uses a comprehensive testing strategy that includes:

- **Unit Tests**: Testing individual functions and utilities
- **Integration Tests**: Testing API endpoints and service integrations
- **Component Tests**: Testing React components in isolation
- **End-to-End (E2E) Tests**: Testing complete user workflows

## Testing Stack

### Core Testing Frameworks

- **[Vitest](https://vitest.dev/)**: Fast, Vite-native test runner for unit and integration tests
- **[Playwright](https://playwright.dev/)**: Modern E2E testing framework
- **[@testing-library/react](https://testing-library.com/react)**: Testing utilities for React components
- **[@testing-library/user-event](https://testing-library.com/docs/user-event/intro)**: User interaction simulation

### Additional Tools

- **[@vitest/ui](https://vitest.dev/guide/ui.html)**: Interactive test UI
- **[@vitest/coverage-v8](https://vitest.dev/guide/coverage.html)**: Code coverage reporting
- **[jsdom](https://github.com/jsdom/jsdom)**: Browser environment simulation
- **[MSW](https://mswjs.io/)**: API mocking (Mock Service Worker)

## Running Tests

### Quick Start

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with interactive UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all

# Run CI test suite (includes coverage)
npm run test:ci
```

### Coverage Reports

After running `npm run test:coverage`, you can view the coverage report:

```bash
# Open HTML coverage report
open coverage/index.html
```

Coverage is also available in JSON, LCOV, and text formats in the `coverage/` directory.

## Writing Tests

### Unit Tests

Unit tests are located in `tests/unit/` and mirror the source structure:

```javascript
// tests/unit/utils/formatters.test.js
import { describe, it, expect } from 'vitest';
import { formatCurrency } from '@/utils/formatters';

describe('formatCurrency', () => {
  it('should format positive numbers as currency', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should handle non-finite values', () => {
    expect(formatCurrency(NaN)).toBe('$0.00');
    expect(formatCurrency(Infinity)).toBe('$0.00');
  });
});
```

### Component Tests

Component tests use React Testing Library:

```javascript
// tests/unit/components/SummaryOverview.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryOverview from '@/components/SummaryOverview';

describe('SummaryOverview', () => {
  const mockTotals = {
    contributions: 50000,
    marketValue: 52000,
    gainLoss: 2000,
    roi: 0.04,
  };

  it('should render all summary cards', () => {
    render(<SummaryOverview totals={mockTotals} />);

    expect(screen.getByText('Total Contributions')).toBeInTheDocument();
    expect(screen.getByText('Market Value')).toBeInTheDocument();
  });

  it('should format currency values correctly', () => {
    render(<SummaryOverview totals={mockTotals} />);

    expect(screen.getByText('$50,000.00')).toBeInTheDocument();
    expect(screen.getByText('$52,000.00')).toBeInTheDocument();
  });
});
```

### Integration Tests

Integration tests for API endpoints:

```javascript
// tests/integration/api/prices-latest.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../../src/lib/supabaseAdmin.js', () => ({
  createSupabaseAdmin: vi.fn(),
}));

import { onRequestGet } from '../../../functions/api/prices/latest.js';

describe('GET /api/prices/latest', () => {
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    mockEnv = {
      SUPABASE_URL: 'https://test.supabase.co',
      API_SHARED_TOKEN: 'test-token',
    };

    mockRequest = new Request('https://test.com/api/prices/latest', {
      method: 'GET',
      headers: { 'X-401K-Token': 'test-token' },
    });
  });

  it('should return latest prices successfully', async () => {
    // Test implementation
  });
});
```

### E2E Tests

E2E tests simulate real user interactions:

```javascript
// tests/e2e/dashboard.spec.js
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should load the dashboard page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/401k Tracker/i);
  });

  test('should display summary overview cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const summaryOverview = page.locator('.summary-overview');
    await expect(summaryOverview).toBeVisible();
  });
});
```

## Test Structure

```
tests/
├── setup.js                      # Global test setup
├── unit/                         # Unit tests
│   ├── utils/                   # Utility function tests
│   │   ├── formatters.test.js
│   │   ├── portfolioMetrics.test.js
│   │   └── parseTransactions.test.js
│   ├── services/                # Service tests
│   │   └── HoldingsService.test.js
│   └── components/              # Component tests
│       └── SummaryOverview.test.jsx
├── integration/                 # Integration tests
│   └── api/                     # API endpoint tests
│       └── prices-latest.test.js
└── e2e/                         # End-to-end tests
    ├── dashboard.spec.js
    └── import.spec.js
```

## Coverage Requirements

The project enforces minimum coverage thresholds (configured in `vitest.config.js`):

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 65%
- **Statements**: 70%

These thresholds ensure that critical code paths are well-tested while allowing flexibility for UI-heavy components.

### Excluded from Coverage

- `node_modules/`
- `tests/` directory
- `dist/` build output
- Configuration files (`*.config.js`)
- Mock data
- MCP server (tested separately)
- Build scripts

## CI/CD Integration

### GitHub Actions Workflows

The project includes two automated test workflows:

#### 1. Test Workflow (`.github/workflows/test.yml`)

Runs on every pull request and push to main:

- Executes all unit and integration tests (required)
- Runs E2E tests with Playwright (optional - continue-on-error)
- Generates and uploads coverage reports
- Comments test results on pull requests

**Note**: E2E tests are configured to continue-on-error in CI as they require a dev server and may be flaky. They are best run locally during development.

#### 2. Deploy Workflow (`.github/workflows/deploy.yml`)

Enhanced to include testing before deployment:

```yaml
- Run unit and integration tests with coverage (required)
- Upload test artifacts
- Build application (only if tests pass)
- Deploy to Cloudflare Pages
```

**Note**: Only unit and integration tests are required to pass before deployment. E2E tests should be run locally with `npm run test:e2e` before pushing critical changes.

### Viewing Test Results

Test results are available in several locations:

1. **GitHub Actions**: View test runs in the "Actions" tab
2. **PR Comments**: Automated comments show test results and coverage
3. **Artifacts**: Download detailed reports from workflow runs
   - `coverage-report`: HTML coverage report
   - `playwright-report`: Interactive test results

## Best Practices

### General Testing Principles

1. **Write tests alongside code**: Create tests when writing new features
2. **Test behavior, not implementation**: Focus on what the code does, not how
3. **Keep tests isolated**: Each test should be independent
4. **Use descriptive test names**: Clearly describe what is being tested
5. **Follow AAA pattern**: Arrange, Act, Assert

### Unit Testing Best Practices

- Test edge cases (null, undefined, empty arrays, extreme values)
- Test error handling and validation
- Keep tests focused on a single behavior
- Use meaningful test data (avoid magic numbers)
- Mock external dependencies

### Component Testing Best Practices

- Test user interactions, not implementation details
- Avoid testing CSS classes or DOM structure
- Use `screen.getByRole()` and semantic queries
- Test accessibility (ARIA labels, keyboard navigation)
- Test loading states and error boundaries

### E2E Testing Best Practices

- Focus on critical user workflows
- Keep tests stable with reliable selectors
- Handle asynchronous operations properly
- Use page objects for complex pages
- Run E2E tests in CI with headless browsers

### Performance Testing

- Monitor test execution time
- Run tests in parallel when possible
- Use `test.only()` for debugging (but never commit it)
- Keep E2E tests focused and minimal

### Debugging Tests

```bash
# Run specific test file
npm test -- formatters.test.js

# Run tests matching a pattern
npm test -- --grep "formatCurrency"

# Run tests in watch mode
npm run test:watch

# Debug with UI
npm run test:ui

# Debug E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed mode to see browser
npm run test:e2e:headed
```

### Common Patterns

#### Mocking Fetch

```javascript
import { vi } from 'vitest';

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mock data' }),
  })
);
```

#### Testing Async Functions

```javascript
it('should fetch data asynchronously', async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});
```

#### Testing User Interactions

```javascript
import userEvent from '@testing-library/user-event';

it('should handle button click', async () => {
  const user = userEvent.setup();
  render(<Button onClick={mockFn} />);

  await user.click(screen.getByRole('button'));

  expect(mockFn).toHaveBeenCalled();
});
```

## Troubleshooting

### Common Issues

**Tests fail with "Cannot find module"**
- Ensure `@` alias is configured in `vitest.config.js`
- Check that imports use correct paths

**E2E tests timeout**
- Increase timeout in `playwright.config.js`
- Check that dev server is running
- Verify network requests complete

**Coverage thresholds not met**
- Add tests for uncovered code
- Check coverage report: `open coverage/index.html`
- Focus on critical paths first

**Flaky E2E tests**
- Use `waitForLoadState('networkidle')`
- Add explicit waits for elements
- Avoid hardcoded timeouts

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Contributing

When adding new features:

1. Write tests alongside the code
2. Ensure tests pass locally: `npm run test:all`
3. Verify coverage meets thresholds: `npm run test:coverage`
4. Run E2E tests: `npm run test:e2e`
5. Push code - CI will run all tests automatically

---

**Last Updated**: 2025-11-04
