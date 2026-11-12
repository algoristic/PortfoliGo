import { expect, expectAccessible, test } from './fixtures';

// Colour scheme and accessibility (J8, J9).

test.describe('colour scheme', () => {
  test('follows the colour scheme of the system, also when it changes', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'covered in Chromium and Firefox');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('#/players');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});

test.describe('accessibility', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'axe results do not depend on the engine',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no serious findings on the main views (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      for (const path of ['#/players', '#/game/preview/dashboard', '#/lab/components']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectAccessible(page);
      }
      await page.goto('#/lab/simulation');
      await page.getByTestId('lab.simulation.seed').fill('e2e-1');
      await page.getByTestId('lab.simulation.generate').click();
      await expect(page.getByTestId('lab.simulation.game-time')).toBeVisible({ timeout: 30_000 });
      await expectAccessible(page);
    });
  }
});
