import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady, GAME_START_TEXT, getClock } from './game.po';
import { createPlayer } from './players.po';

// Language switch (AP 6.8a, PS US-UI-11, TS §11.9, E-36): German by default; English after a
// reload with the translations loaded before the app, British number and date formats, EUR and UTC.
// The texts are the sample translations of AP 6.8a; dates and numbers follow from the calendar
// (game start Monday 01.04.2030, 00:00) and the sample change +1,23 % of the settings page.

test.describe('language', () => {
  // `@intl`: English is `en-GB` in UTC also in an `en-US` browser in Los Angeles.
  test(
    'switches to English after a reload and back to German',
    { tag: '@intl' },
    async ({ page }) => {
      const warnings: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning') {
          warnings.push(message.text());
        }
      });
      const game = await createPlayer(page, 'Anna');
      await page.goto(`${game}/settings`);
      await expectGameReady(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.getByTestId('settings.device.language.de')).toBeChecked();
      await expect(page.getByTestId('settings.device.change-colors.up')).toHaveText('+1,23 %');
      await expect(getClock(page)).toHaveText(GAME_START_TEXT);

      await page.waitForLoadState('networkidle');
      const reloaded = page.waitForEvent('load');
      await page.getByTestId('settings.device.language.en').check();
      await reloaded;
      await expectGameReady(page);

      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page).toHaveTitle(/Settings/);
      await expect(page.getByTestId('settings.device.language.en')).toBeChecked();
      await expect(page.getByTestId('settings.device.change-colors.up')).toHaveText('+1.23%');
      await expect(getClock(page)).toHaveText('Mon, 01/04/2030, 00:00');
      await expectAccessible(page);
      expect(warnings.filter((text) => /translation/i.test(text))).toEqual([]);

      await page.waitForLoadState('networkidle');
      const back = page.waitForEvent('load');
      await page.getByTestId('settings.device.language.de').check();
      await back;
      await expectGameReady(page);

      await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.getByTestId('settings.device.change-colors.up')).toHaveText('+1,23 %');
      await expect(getClock(page)).toHaveText(GAME_START_TEXT);
    },
  );

  test('sets the language of <html> before Angular starts', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pgo.settings',
        JSON.stringify({ v: 1, data: { locale: { language: 'en' } } }),
      );
      const record = { atBody: null as string | null };
      (window as unknown as { langAtBody: typeof record }).langAtBody = record;
      const parsing = new MutationObserver(() => {
        if (document.body !== null) {
          record.atBody = document.documentElement.lang;
          parsing.disconnect();
        }
      });
      parsing.observe(document, { subtree: true, childList: true });
    });
    await page.goto('#/players');
    await expect(page.getByRole('heading', { level: 1, name: 'Choose player' })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { langAtBody: { atBody: string | null } }).langAtBody.atBody,
      ),
    ).toBe('en');
  });
});
