import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('Dashboard loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Wait for critical elements
    await page.waitForTimeout(3000); // Wait for initial render and animations
    
    // Check main layout elements
    await expect(page).toHaveTitle(/HELM Control Room/);
    
    // Visual snapshot of the dashboard
    await expect(page).toHaveScreenshot('dashboard-initial.png', {
      mask: [page.locator('[data-testid="timestamp"]')], // Mask dynamic content
      fullPage: true
    });
  });


});
