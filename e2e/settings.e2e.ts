import { Page } from '@playwright/test';

import { expect, expectAccessible, test } from './fixtures';
import { createPlayer } from './players.po';
import { recordRootClasses, storeColorScheme } from './settings.po';

// Appearance without flickering (AP 2.6, TS §11.5): the inline script of `index.html` sets the
// `dark` class from `pgo.settings` before Angular starts.

test.describe('appearance', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'the inline script does not depend on the engine',
  );

  test('starts dark by default, also when the system prefers light', async ({ page }) => {
    // E-06, PS US-UI-01
    await page.emulateMedia({ colorScheme: 'light' });
    const rootClasses = await recordRootClasses(page);
    await page.goto('#/players');
    await expect(page.getByTestId('players.list.create')).toBeVisible();

    const { atBody, changes } = await rootClasses();
    expect(atBody).toMatch(/\bdark\b/);
    expect(changes.filter((classes) => !/\bdark\b/.test(classes))).toEqual([]);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('keeps „Hell“ from the settings page after a reload without a dark state', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const game = await createPlayer(page, 'Anna');
    await page.goto(`${game}/settings`);
    await page.getByTestId('settings.device.color-scheme.light').check();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    const rootClasses = await recordRootClasses(page);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.getByTestId('settings.device.color-scheme.light')).toBeChecked();

    const { atBody, changes } = await rootClasses();
    expect(atBody).not.toBeNull();
    expect(atBody).not.toMatch(/\bdark\b/);
    expect(changes.filter((classes) => /\bdark\b/.test(classes))).toEqual([]);
  });

  test('follows the system before Angular starts with „System“', async ({ page }) => {
    await storeColorScheme(page, 'system');
    await page.emulateMedia({ colorScheme: 'light' });
    const rootClasses = await recordRootClasses(page);
    await page.goto('#/players');
    await expect(page.getByTestId('players.list.create')).toBeVisible();
    expect((await rootClasses()).atBody).not.toMatch(/\bdark\b/);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});

// Gain and loss colours (AP 6.2, PS US-UI-02, TS §11.5): the inline script sets the class of the
// stored choice before Angular starts, so the tokens hold from the first paint.
test.describe('gain and loss colours', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'the inline script does not depend on the engine',
  );

  test('keeps blue and orange after a reload, without a green and red state', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await page.goto(`${game}/settings`);
    await page.getByTestId('settings.device.change-colors.blue-orange').check();
    const root = page.locator('html');
    await expect(root).toHaveClass(/\bcolors-blue-orange\b/);
    // TS §11.5: the blue and orange pair of the dark theme.
    expect(await upAndDown(page)).toEqual(['#5aa9e6', '#ff9933']);
    await expectAccessible(page);

    const rootClasses = await recordRootClasses(page);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.getByTestId('settings.device.change-colors.blue-orange')).toBeChecked();
    const { atBody, changes } = await rootClasses();
    expect(atBody).toMatch(/\bcolors-blue-orange\b/);
    expect(changes.filter((classes) => !/\bcolors-blue-orange\b/.test(classes))).toEqual([]);

    await page.getByTestId('settings.device.color-scheme.light').check();
    await expect(root).not.toHaveClass(/\bdark\b/);
    expect(await upAndDown(page)).toEqual(['#0a5fa8', '#a14a00']);
    await expectAccessible(page);

    await page.getByTestId('settings.device.change-colors.green-red').check();
    await expect(root).not.toHaveClass(/\bcolors-blue-orange\b/);
    expect(await upAndDown(page)).toEqual(['#0f7b3f', '#c62828']);
  });
});

/** The tokens `--pgo-up` and `--pgo-down` as `<html>` resolves them. */
function upAndDown(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ['--pgo-up', '--pgo-down'].map((name) => style.getPropertyValue(name).trim());
  });
}
