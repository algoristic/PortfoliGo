import { expect, Page } from '@playwright/test';

import { expectDialogReady } from './fixtures';
import { expectGameReady, getClock, getSpeed } from './game.po';

// Page object of the depot (AP 5.5): a position from one purchase in the open exchange.

/** The first share of every world (`stk-0001`, series 0). */
export const PORTFOLIO_INSTRUMENT = 'stk-0001';

/** Jumps through the jump dialog of the speed menu (on phones too) to a time of a date. */
async function jumpThroughSpeedMenu(
  page: Page,
  date: string,
  time: string,
  text: string,
): Promise<void> {
  await getSpeed(page).click();
  await page.getByTestId('shell.header.speed.jump').click();
  await expectDialogReady(page, 'clock.jump-dialog');
  await page.getByTestId('clock.jump-dialog.date-kind').check();
  await page.getByTestId('clock.jump-dialog.date').fill(date);
  await page.getByTestId('clock.jump-dialog.time').fill(time);
  await page.getByTestId('clock.jump-dialog.submit').click();
  await expect(getClock(page)).toHaveText(text, { timeout: 30_000 });
}

/**
 * Opens a depot from the hint of „Kaufen“, transfers 2.000 €, jumps half an hour past the open of
 * the share's exchange and buys one share at market. Reads German texts.
 */
export async function buyOneShare(page: Page, game: string): Promise<void> {
  await page.goto(`${game}/markets/${PORTFOLIO_INSTRUMENT}`);
  await expectGameReady(page);
  const status = await page.getByTestId('market.instrument.status').textContent();
  const opens = /öffnet Mo\., (\d{2}):(\d{2})/.exec(status ?? '');
  expect(opens).not.toBeNull();
  await page.getByTestId('trading.trade-actions.buy').click();
  await page.getByTestId('dialog-confirm.confirm').click();
  await page.getByTestId('banking.open-account-dialog.submit').click();
  await expect(page.getByTestId('banking.open-account-dialog.submit')).toHaveCount(0);

  await page.goto(`${game}/accounts`);
  await expectGameReady(page);
  await page.getByTestId('banking.accounts.transfer').click();
  await expectDialogReady(page, 'banking.transfer-dialog');
  await page.getByTestId('banking.transfer-dialog.to').selectOption('acc-2');
  await page.getByTestId('banking.transfer-dialog.amount').fill('2000');
  await page.getByTestId('banking.transfer-dialog.submit').click();
  await expect(page.getByTestId('banking.transfer-dialog.submit')).toHaveCount(0);

  const minute = Number(opens![1]) * 60 + Number(opens![2]) + 30;
  const pad = (value: number): string => String(value).padStart(2, '0');
  const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  await jumpThroughSpeedMenu(page, '2030-04-01', time, `Mo., 01.04.2030, ${time}`);

  await page.goto(`${game}/markets/${PORTFOLIO_INSTRUMENT}`);
  await expectGameReady(page);
  await page.getByTestId('trading.trade-actions.buy').click();
  await expectDialogReady(page, 'trading.order-ticket');
  await page.getByTestId('trading.order-ticket.quantity').fill('1');
  await expect(page.getByTestId('trading.order-ticket.total')).toBeVisible();
  await page.getByTestId('trading.order-ticket.submit').click();
  await expect(page.getByTestId('trading.order-ticket.submit')).toHaveCount(0);
  await expect(page.getByTestId('trading.trade-actions.position')).toHaveText('Im Depot: 1 Stück');
}
