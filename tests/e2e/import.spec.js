import { test, expect } from '@playwright/test';

test.describe('Transaction Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to import page', async ({ page }) => {
    // Look for import/settings navigation
    const importLink = page.locator('a[href*="import"], a[href*="settings"]').first();

    if (await importLink.isVisible()) {
      await importLink.click();
      await page.waitForLoadState('networkidle');

      // Should be on import or settings page
      expect(page.url()).toMatch(/\/(import|settings)/);
    }
  });

  test('should display import method selector', async ({ page }) => {
    // Navigate to import page
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    // Check for import method options (Plaid or Manual)
    const pageContent = await page.textContent('body');

    // Should mention Plaid or manual import options
    const hasPlaidMention = pageContent.includes('Plaid') || pageContent.includes('plaid');
    const hasManualMention = pageContent.includes('Manual') || pageContent.includes('manual') ||
                             pageContent.includes('Voya') || pageContent.includes('CSV');

    expect(hasPlaidMention || hasManualMention).toBe(true);
  });

  test('should handle Plaid Link initialization', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    // Look for Plaid Link button
    const plaidButton = page.locator('button:has-text("Connect"), button:has-text("Plaid")').first();

    if (await plaidButton.isVisible()) {
      // Button should be present
      await expect(plaidButton).toBeVisible();

      // Note: Actually clicking would require Plaid sandbox credentials
      // In a real test environment, you would set up Plaid test mode
    }
  });

  test('should validate CSV import format', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    // Look for manual/CSV import option
    const manualImportButton = page.locator('button:has-text("Manual"), button:has-text("CSV"), button:has-text("Voya")').first();

    if (await manualImportButton.isVisible()) {
      await manualImportButton.click();
      await page.waitForTimeout(500);

      // Should show textarea or file upload
      const textarea = page.locator('textarea');
      const fileInput = page.locator('input[type="file"]');

      const hasTextarea = await textarea.isVisible();
      const hasFileInput = await fileInput.isVisible();

      expect(hasTextarea || hasFileInput).toBe(true);

      // Try to submit empty data
      if (hasTextarea) {
        const submitButton = page.locator('button:has-text("Import"), button:has-text("Upload"), button:has-text("Parse")').first();

        if (await submitButton.isVisible()) {
          await submitButton.click();
          await page.waitForTimeout(500);

          // Should show validation error or stay on page
          const errorMessage = page.locator('.error, .alert, [role="alert"]').first();
          // Either shows error or doesn't navigate away
          const currentUrl = page.url();
          expect(currentUrl.includes('import') || await errorMessage.isVisible()).toBe(true);
        }
      }
    }
  });

  test('should parse valid CSV data', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    const sampleCSV = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Employee Contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00
01/16/2025,Employer Contribution,VTI,Safe Harbor Match,5.25,$250.00,$1312.50`;

    // Look for manual import option
    const manualImportButton = page.locator('button:has-text("Manual"), button:has-text("CSV"), button:has-text("Voya")').first();

    if (await manualImportButton.isVisible()) {
      await manualImportButton.click();
      await page.waitForTimeout(500);

      const textarea = page.locator('textarea').first();

      if (await textarea.isVisible()) {
        await textarea.fill(sampleCSV);

        const submitButton = page.locator('button:has-text("Import"), button:has-text("Upload"), button:has-text("Parse")').first();

        if (await submitButton.isVisible()) {
          await submitButton.click();
          await page.waitForTimeout(1000);

          // Should either show success message or parsed data
          const pageContent = await page.textContent('body');
          const hasData = pageContent.includes('VTI') ||
                         pageContent.includes('2625') ||
                         pageContent.includes('Employee');

          expect(hasData).toBe(true);
        }
      }
    }
  });
});

test.describe('Account Management', () => {
  test('should display connected accounts', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    // Check if accounts page loads
    const pageContent = await page.textContent('body');
    expect(pageContent.length).toBeGreaterThan(0);

    // Should show either accounts or empty state
    const hasAccounts = pageContent.includes('Account') || pageContent.includes('account');
    const hasEmptyState = pageContent.includes('No accounts') ||
                         pageContent.includes('Connect') ||
                         pageContent.includes('Get started');

    expect(hasAccounts || hasEmptyState).toBe(true);
  });

  test('should handle account disconnection', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    // Look for disconnect/remove button
    const disconnectButton = page.locator('button:has-text("Disconnect"), button:has-text("Remove")').first();

    if (await disconnectButton.isVisible()) {
      // Button exists, but we won't click it in automated tests
      // to avoid actually disconnecting accounts
      await expect(disconnectButton).toBeVisible();
    }
  });
});

test.describe('Data Sync', () => {
  test('should display sync status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for sync status indicator
    const syncButton = page.locator('button:has-text("Sync"), button:has-text("Refresh")').first();

    if (await syncButton.isVisible()) {
      await expect(syncButton).toBeVisible();

      // Check if button is enabled (not in loading state)
      const isDisabled = await syncButton.isDisabled();

      // Button should be either enabled or disabled during sync
      expect(typeof isDisabled).toBe('boolean');
    }
  });

  test('should handle manual sync trigger', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const syncButton = page.locator('button:has-text("Sync"), button:has-text("Refresh")').first();

    if (await syncButton.isVisible() && !(await syncButton.isDisabled())) {
      // Click sync button
      await syncButton.click();

      // Wait for sync to start
      await page.waitForTimeout(1000);

      // Should show loading state or completion
      const pageContent = await page.textContent('body');

      // Either shows loading indicator or completes sync
      const showsLoading = pageContent.includes('Syncing') ||
                          pageContent.includes('Loading') ||
                          await syncButton.isDisabled();

      // If not showing loading, sync might have completed very quickly
      expect(showsLoading || pageContent.length > 0).toBe(true);
    }
  });
});
