import { expect, Locator, Page } from '@playwright/test';

import { getClock } from './game.po';

// Page object of the accounts and the statement (AP 3.4).

export const getAccountCard = (page: Page, accountId: string): Locator =>
  page.getByTestId(`banking.accounts.card.${accountId}`);
export const getStatementList = (page: Page): Locator => page.getByTestId('banking.statement.list');
export const getStatementTexts = (page: Page): Locator =>
  page.getByTestId('banking.statement.entry.text');
export const getStatementTotal = (page: Page): Locator =>
  page.getByTestId('banking.statement.total');
export const getStatementSearch = (page: Page): Locator =>
  page.getByTestId('banking.statement.filter.search');

/**
 * Jumps to a game time through the jump dialog (`date` as `yyyy-MM-dd`, `time` as `HH:mm`) and
 * waits until the clock shows it (`expected`, e.g. `Mo., 01.04.2030, 07:00`).
 */
export async function jumpTo(
  page: Page,
  date: string,
  time: string,
  expected: string,
): Promise<void> {
  await page.getByTestId('shell.header.jump-button').click();
  await page.getByTestId('clock.jump-dialog.date-kind').check();
  await page.getByTestId('clock.jump-dialog.date').fill(date);
  await page.getByTestId('clock.jump-dialog.time').fill(time);
  await page.getByTestId('clock.jump-dialog.submit').click();
  await expect(getClock(page)).toHaveText(expected, { timeout: 30_000 });
}

/** Opens the statement of an account from its card in the account overview. */
export async function openStatement(page: Page, accountId: string): Promise<void> {
  await getAccountCard(page, accountId).getByTestId('banking.accounts.card.statement').click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${accountId}$`));
}
