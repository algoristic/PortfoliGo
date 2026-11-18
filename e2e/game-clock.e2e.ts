import { expect, expectAccessible, expectDialogReady, test } from './fixtures';
import {
  expectClockRunsPast,
  expectGameReady,
  GAME_START_TEXT,
  getClock,
  getPausedBadge,
  getSpeed,
  parseGameTime,
  pause,
  readGameTime,
  resume,
  selectSpeed,
  settleAnimations,
} from './game.po';
import { createPlayer } from './players.po';
import { storeColorScheme } from './settings.po';

// The clock bar with the real engine worker (AP 2.5, with the system tests of AP 2.2). Expected
// times come from the calendar; the clock is controlled only through the product (TS §14.1).

const DAY_MS = 24 * 60 * 60 * 1000;

test.describe('game clock', () => {
  test('starts paused, runs, pauses, changes the speed and jumps to the next month', async ({
    page,
  }) => {
    // US-SP-01, US-ZT-03: a new player rests at the game start.
    await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await expect(getClock(page)).toHaveText(GAME_START_TEXT);
    await expect(getPausedBadge(page)).toBeVisible();
    await expect(getSpeed(page)).toHaveText('1 min/s');

    // Clock events of the worker arrive (AP 2.2).
    await resume(page);
    await expectClockRunsPast(page, parseGameTime(GAME_START_TEXT));
    await pause(page);
    const paused = await getClock(page).textContent();

    // A paused clock stands still, also at the fastest speed (US-ZT-02).
    await selectSpeed(page, '1w', '1 w/s');
    await expect(getPausedBadge(page)).toBeVisible();
    await expect(getClock(page)).toHaveText(paused ?? '');

    // The new speed applies at once: two game days pass within seconds, not within 48 minutes.
    const before = parseGameTime(paused);
    await resume(page);
    await expectClockRunsPast(page, before + 2 * DAY_MS);
    await pause(page);
    expect(await readGameTime(page)).toBeGreaterThan(before + 2 * DAY_MS);

    // US-ZT-05: jump to the next month start; the pause stays.
    await selectSpeed(page, '1min', '1 min/s');
    await page.getByTestId('shell.header.jump-button').click();
    await expectDialogReady(page, 'clock.jump-dialog');
    await page.getByTestId('clock.jump-dialog.next-month').check();
    await page.getByTestId('clock.jump-dialog.submit').click();
    await expect(getClock(page)).toHaveText('Mi., 01.05.2030, 00:00', { timeout: 30_000 });
    await expect(page.getByTestId('shell.header.jump')).toBeHidden();
    await expect(getPausedBadge(page)).toBeVisible();
  });

  test('toggles the pause and the speed with the keyboard unless a control has the focus', async ({
    page,
  }) => {
    // US-ZT-02, TS §11.10
    await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await expect(getPausedBadge(page)).toBeVisible();

    await page.getByTestId('shell.content').focus();
    await page.keyboard.press('Space');
    await expect(getPausedBadge(page)).toBeHidden();
    await page.keyboard.press('Space');
    await expect(getPausedBadge(page)).toBeVisible();
    await page.keyboard.press('+');
    await expect(getSpeed(page)).toHaveText('10 min/s');
    // Each key steps from the speed the bar shows, so wait for it before the next one.
    await page.keyboard.press('-');
    await expect(getSpeed(page)).toHaveText('1 min/s');
    await page.keyboard.press('-');
    await expect(getSpeed(page)).toHaveText('Echtzeit');

    // A link uses the keys itself (the search field is still disabled in M2).
    await page.getByTestId('shell.header.notifications').focus();
    await page.keyboard.press('+');
    await page.keyboard.press('Space');
    // The keys took effect on the content before, so a missing reaction now is no delay.
    await page.getByTestId('shell.content').focus();
    await page.keyboard.press('+');
    await expect(getSpeed(page)).toHaveText('1 min/s');
    await expect(getPausedBadge(page)).toBeVisible();
  });
});

test.describe('accessibility of the clock bar', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'axe results do not depend on the engine',
  );

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no serious findings in the exchange list and the jump dialog (${colorScheme})`, async ({
      page,
    }) => {
      await storeColorScheme(page, colorScheme);
      await page.emulateMedia({ colorScheme });
      await createPlayer(page, 'Anna');
      await expectGameReady(page);

      await page.getByTestId('shell.header.markets').click();
      await expect(page.getByTestId('shell.header.exchanges')).toBeVisible();
      await settleAnimations(page);
      await expectAccessible(page);
      await page.getByTestId('shell.header.exchanges.close').click();

      await page.getByTestId('shell.header.jump-button').click();
      await expect(page.getByTestId('clock.jump-dialog.submit')).toBeVisible();
      // The dialog fades in; axe would measure the contrast of a half-transparent button.
      await settleAnimations(page);
      await expectAccessible(page);
    });
  }
});
