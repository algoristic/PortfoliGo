import { expect, Locator, Page } from '@playwright/test';

// Page object of the notifications (AP 3.6): centre, bell, toasts, absence report and the
// auto-pause switches of the settings page.

/** The first bank run books the living costs on Monday, 01.04.2030, 06:00 (E-19). */
export const BANK_RUN_TEXT = 'Mo., 01.04.2030, 06:00';

export const getBell = (page: Page): Locator => page.getByTestId('shell.header.notifications');
export const getEntry = (page: Page, seq: number): Locator =>
  page.getByTestId(`notifications.center.entry.${seq}`);
export const getToast = (page: Page, text: string): Locator =>
  page.locator('[data-testid^="toast."] p').filter({ hasText: text });
export const getAbsenceReport = (page: Page, part: string): Locator =>
  page.getByTestId(`notifications.absence-report.${part}`);
export const getAutoPauseSwitch = (page: Page, code: string): Locator =>
  page.getByTestId(`settings.player.auto-pause.${code}`);

export interface StartConditions {
  /** Amounts as typed into the form, e.g. `0`, `500`, `2000`. */
  startCapital?: string;
  netIncome?: string;
  livingCosts?: string;
}

/**
 * Creates a player through „Spieler anlegen“ with the given start conditions (the others keep
 * their defaults) and waits for the game area. Returns the hash path, e.g. `#/game/p-…`.
 */
export async function createPlayerWith(
  page: Page,
  name: string,
  start: StartConditions,
): Promise<string> {
  await page.goto('#/players/new');
  await page.getByTestId('players.new.name').fill(name);
  const fields = [
    ['players.new.start-capital', start.startCapital],
    ['players.new.net-income', start.netIncome],
    ['players.new.living-costs', start.livingCosts],
  ] as const;
  for (const [testId, value] of fields) {
    if (value !== undefined) {
      await page.getByTestId(testId).fill(value);
      await page.getByTestId(testId).blur();
    }
  }
  await page.getByTestId('players.new.submit').click();
  await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/dashboard$/);
  const playerId = /#\/game\/(p-[0-9a-f]{32})\//.exec(page.url())?.[1];
  if (playerId === undefined) {
    throw new Error(`No player ID in ${page.url()}`);
  }
  return `#/game/${playerId}`;
}

/** The bell names the number of unread notifications, without a number when there are none. */
export async function expectUnread(page: Page, count: number): Promise<void> {
  await expect(getBell(page)).toHaveAttribute(
    'aria-label',
    count === 0 ? 'Benachrichtigungen' : `Benachrichtigungen, ${count} ungelesen`,
  );
}
