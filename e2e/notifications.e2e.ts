import { expect, expectAccessible, test } from './fixtures';
import {
  expectClockStored,
  expectGameReady,
  expectPlayerUnlocked,
  getClock,
  getPausedBadge,
  moveLastSeenBack,
  playerIdOf,
  resume,
  selectSpeed,
  settleAnimations,
} from './game.po';
import {
  BANK_RUN_TEXT,
  createPlayerWith,
  expectUnread,
  getAbsenceReport,
  getAutoPauseSwitch,
  getBell,
  getEntry,
  getToast,
} from './notifications.po';

// Notifications with the real worker (AP 3.6, US-BN-01–03, US-ZT-06). Expected values are texts
// and calendar times; amounts of the model are not asserted (TS §14.1).

const HOUR_MS = 60 * 60 * 1000;

test.describe('notifications', () => {
  test('pauses at the exceeded overdraft and shows it in the clock bar, toast and centre', async ({
    page,
  }) => {
    // Net income 500 €, living costs 2.000 €: allowed with a hint; the overdraft limit follows
    // the income, so the first debit exceeds it (critical, auto-pause by default).
    const game = await createPlayerWith(page, 'Ben', {
      startCapital: '0',
      netIncome: '500',
      livingCosts: '2000',
    });
    await expectGameReady(page);
    await selectSpeed(page, '1h', '1 h/s');
    await resume(page);

    await expect(getClock(page)).toHaveText(BANK_RUN_TEXT, { timeout: 30_000 });
    await expect(getPausedBadge(page)).toHaveText('Pausiert: Dispo überschritten');
    await expect(getToast(page, 'Dispo überschritten:')).toBeVisible();
    await expectUnread(page, 2);

    await getBell(page).click();
    await expect(page).toHaveURL(new RegExp(`${game.slice(1)}/notifications$`));
    await expect(getEntry(page, 2).getByTestId('notifications.center.entry.title')).toHaveText(
      'Dispo überschritten',
    );
    await expect(getEntry(page, 1).getByTestId('notifications.center.entry.time')).toHaveText(
      BANK_RUN_TEXT,
    );
    await expectAccessible(page);

    await page.getByTestId('notifications.center.entry.2.mark-read').click();
    await expectUnread(page, 1);
    await page.getByTestId('notifications.center.mark-all-read').click();
    await expectUnread(page, 0);

    await page.goto(`${game}/settings`);
    await expect(getAutoPauseSwitch(page, 'overdraft-limit-exceeded')).toBeChecked();
    await expectAccessible(page);
  });

  test('shows the absence report after the catch-up of a reload', async ({ page, context }) => {
    // US-ZT-04, US-BN-03: closed, the game runs on in real time; the catch-up books the living
    // costs at 06:00 and the report sums them up. Real time yields one tick per minute, so the
    // absence is set with `moveLastSeenBack` (exception in TS §14.1, as in game-session.e2e.ts).
    const game = await createPlayerWith(page, 'Anna', { startCapital: '0' });
    const playerId = playerIdOf(game);
    await expectGameReady(page);
    await selectSpeed(page, 'realtime', 'Echtzeit');
    await resume(page);
    await expectClockStored(page, playerId, { paused: false, speed: 'realtime' });
    const closedAt = await getClock(page).textContent();
    await page.waitForLoadState('networkidle');
    await page.close();

    const next = await context.newPage();
    await next.goto('#/players');
    await expectPlayerUnlocked(next, playerId);
    await moveLastSeenBack(next, playerId, 7 * HOUR_MS);
    await next.goto(`${game}/dashboard`);
    await expectGameReady(next);

    await expect(getAbsenceReport(next, 'from')).toHaveText(closedAt ?? '');
    await expect(getAbsenceReport(next, 'warning-count')).toHaveText('Warnungen (1)');
    await expect(getAbsenceReport(next, 'warning-title')).toHaveText('Konto nicht gedeckt');
    await settleAnimations(next);
    await expectAccessible(next);

    await next.keyboard.press('Escape');
    await expect(getAbsenceReport(next, 'from')).toBeHidden();
    await expect(getPausedBadge(next)).toBeHidden();
  });
});
