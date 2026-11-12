import { expect, test } from './fixtures';
import {
  expectClockRunsPast,
  expectClockStored,
  expectGameReady,
  expectPlayerUnlocked,
  GAME_START_TEXT,
  getClock,
  getPausedBadge,
  moveLastSeenBack,
  parseGameTime,
  pause,
  playerIdOf,
  readGameTime,
  recordOverlayHeadings,
  resume,
  selectSpeed,
} from './game.po';
import { createPlayer } from './players.po';

// Persistence and the Web Lock with the real worker and IndexedDB (AP 2.5, with the system tests
// of AP 2.3). Expected times come from the calendar (TS §14.1).

const HOUR_MS = 60 * 60 * 1000;
/** April 2030 has 30 days. */
const DAYS_OF_APRIL_MS = 30 * 24 * HOUR_MS;

test.describe('game session', () => {
  test('restores the game time and the pause after a reload', async ({ page }) => {
    // US-ZT-03, E-02: a pause stays a pause.
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await resume(page);
    await expectClockRunsPast(page, parseGameTime(GAME_START_TEXT));
    await pause(page);
    const paused = await getClock(page).textContent();
    await expectClockStored(page, playerIdOf(game), { paused: true, speed: '1min' });

    // Reload only a loaded page: a reload that cancels a lazy chunk is logged as an error.
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expectGameReady(page);
    await expect(getClock(page)).toHaveText(paused ?? '');
    await expect(getPausedBadge(page)).toBeVisible();
  });

  test('locks the player in a second tab while the first one keeps running', async ({
    page,
    context,
  }) => {
    // US-SP-02, TS §9.4
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await resume(page);

    const second = await context.newPage();
    await second.goto(`${game}/dashboard`);
    await expect(second.getByTestId('shell.session-overlay.heading')).toHaveText(
      'Spieler bereits geöffnet',
    );

    await expectClockRunsPast(page, await readGameTime(page));
    await expect(getPausedBadge(page)).toBeHidden();

    await second.getByTestId('shell.session-overlay.players').click();
    await expect(second).toHaveURL(/#\/players$/);
    await second.close();
  });

  test('catches up the time in real time after the app was closed', async ({ page, context }) => {
    // US-ZT-04, TS §3.7: closed, the game runs on in real time, one game minute per minute.
    const game = await createPlayer(page, 'Anna');
    const playerId = playerIdOf(game);
    await expectGameReady(page);
    await selectSpeed(page, 'realtime', 'Echtzeit');
    await resume(page);
    await expectClockStored(page, playerId, { paused: false, speed: 'realtime' });
    await page.waitForLoadState('networkidle');
    await page.close();

    const next = await context.newPage();
    await next.goto('#/players');
    await expectPlayerUnlocked(next, playerId);
    // 30 days of absence: long enough that the catch-up shows its overlay for a few frames.
    await moveLastSeenBack(next, playerId, DAYS_OF_APRIL_MS);
    const overlayHeadings = await recordOverlayHeadings(next);
    await next.goto(`${game}/dashboard`);
    await expectGameReady(next);
    await expect(getClock(next)).toHaveText('Mi., 01.05.2030, 00:00');
    await expect(getPausedBadge(next)).toBeHidden();
    expect(await overlayHeadings()).toContain('Nachberechnung');
  });

  test('does not catch up when the app was closed paused', async ({ page, context }) => {
    // US-ZT-03, E-02: a pause stays a pause also while the app is closed.
    const game = await createPlayer(page, 'Anna');
    const playerId = playerIdOf(game);
    await expectGameReady(page);
    await selectSpeed(page, 'realtime', 'Echtzeit');
    await expectClockStored(page, playerId, { paused: true, speed: 'realtime' });
    await page.waitForLoadState('networkidle');
    await page.close();

    const next = await context.newPage();
    await next.goto('#/players');
    await expectPlayerUnlocked(next, playerId);
    await moveLastSeenBack(next, playerId, HOUR_MS);
    const overlayHeadings = await recordOverlayHeadings(next);
    await next.goto(`${game}/dashboard`);
    await expectGameReady(next);
    await expect(getClock(next)).toHaveText(GAME_START_TEXT);
    await expect(getPausedBadge(next)).toBeVisible();
    expect(await overlayHeadings()).not.toContain('Nachberechnung');
  });
});
