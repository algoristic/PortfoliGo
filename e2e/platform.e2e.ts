import { expect, test } from './fixtures';
import { storeColorScheme } from './settings.po';

// Colour scheme (J8); the accessibility of the main views is in `accessibility.e2e.ts` (J9).

test.describe('colour scheme', () => {
  test('follows the colour scheme of the system with the setting „System“, also when it changes', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'covered in Chromium and Firefox');
    await storeColorScheme(page, 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('#/players');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});
