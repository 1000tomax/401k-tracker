import { test, expect } from '@playwright/test';

/**
 * Deployment Smoke Test
 *
 * This test acts as a safety gate before deployment.
 * It verifies that the built application can load and render
 * the basic UI elements correctly.
 *
 * CRITICAL: If this test fails, the deployment will be blocked.
 */
test.describe('Deployment Smoke Test', () => {
  test('homepage loads and displays main title', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Check that the main H1 title is visible
    const mainTitle = page.getByRole('heading', { name: '401k Tracker', level: 1 });
    await expect(mainTitle).toBeVisible();

    // Verify the page is not showing an error state
    const errorMessages = page.getByText(/error|failed|something went wrong/i);
    await expect(errorMessages).not.toBeVisible();
  });

  test('navigation elements are present', async ({ page }) => {
    await page.goto('/');

    // Check that main navigation links are visible
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dividends' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Accounts' })).toBeVisible();
  });
});
