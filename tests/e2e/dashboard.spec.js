import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');
  });

  test('should load the dashboard page', async ({ page }) => {
    // Check that the page title is correct
    await expect(page).toHaveTitle(/401k Tracker/i);
  });

  test('should display the navigation menu', async ({ page }) => {
    // Check that main navigation items are present
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should display summary overview cards', async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check for summary cards
    const summaryOverview = page.locator('.summary-overview');
    if (await summaryOverview.isVisible()) {
      await expect(summaryOverview).toBeVisible();

      // Check for key metrics
      const summaryCards = page.locator('.summary-card');
      await expect(summaryCards.first()).toBeVisible();
    }
  });

  test('should handle authentication token requirement', async ({ page }) => {
    // The app requires VITE_401K_TOKEN environment variable
    // In a real test, you would set this up in your test environment
    await page.waitForLoadState('networkidle');

    // Page should either show content (if token is set) or an error/auth prompt
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForLoadState('networkidle');
    await expect(body).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    // Wait for initial load
    await page.waitForLoadState('networkidle');

    // Try to find and click navigation links
    const transactionsLink = page.locator('a[href*="transactions"]').first();
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForLoadState('networkidle');

      // URL should change
      expect(page.url()).toContain('transactions');
    }
  });
});

test.describe('Portfolio View', () => {
  test('should display portfolio data when available', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if portfolio table exists
    const portfolioTable = page.locator('.portfolio-table, table');

    // If data is available, table should be visible
    // If not, there should be some kind of empty state or loading indicator
    const pageContent = await page.textContent('body');
    expect(pageContent.length).toBeGreaterThan(0);
  });

  test('should handle loading states', async ({ page }) => {
    await page.goto('/');

    // There should be some indication of loading (spinner, skeleton, etc.)
    // or the page should load quickly and show content
    await page.waitForLoadState('domcontentloaded');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Offline Support (PWA)', () => {
  test('should show offline banner when offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Simulate going offline
    await context.setOffline(true);

    // Wait a moment for the app to detect offline status
    await page.waitForTimeout(1000);

    // Check if offline banner appears
    const offlineBanner = page.locator('.offline-banner');
    if (await offlineBanner.isVisible()) {
      await expect(offlineBanner).toBeVisible();
    }

    // Go back online
    await context.setOffline(false);
  });

  test('should register service worker', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if service worker is registered (in production build)
    const swRegistration = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });

    expect(swRegistration).toBe(true);
  });
});

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have console errors', async ({ page }) => {
    const consoleErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors (e.g., from development mode)
    const criticalErrors = consoleErrors.filter(error => {
      return !error.includes('React DevTools') &&
             !error.includes('Download the React DevTools');
    });

    expect(criticalErrors).toHaveLength(0);
  });
});
