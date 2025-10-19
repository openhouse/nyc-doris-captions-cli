import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('home page accessibility', () => {
  test('loads and passes axe', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true }
    });
    await expect(page.getByRole('heading', { name: /browse/i })).toBeVisible();
  });
});
