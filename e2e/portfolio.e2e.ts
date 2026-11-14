import { Page } from '@playwright/test';

import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady, getClock, getSpeed } from './game.po';
import { createPlayer } from './players.po';

// Depot, position detail and tax page with the real worker (AP 5.5, US-PF-02/03/06, US-ST-04): a
// purchase in the open exchange appears as a position, the allocation tabs follow the keyboard,
// the position detail shows its lot and trade, the tax page the running year. Expected values are
// states, texts and share counts; model prices are not asserted.

/** The first share of every world (`stk-0001`, series 0). */
const INSTRUMENT = 'stk-0001';

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

/** Jumps through the jump dialog of the speed menu (on phones too) to a time of a date. */
async function jumpTo(page: Page, date: string, time: string, text: string): Promise<void> {
  await getSpeed(page).click();
  await page.getByTestId('shell.header.speed.jump').click();
  await page.getByTestId('clock.jump-dialog.date-kind').check();
  await page.getByTestId('clock.jump-dialog.date').fill(date);
  await page.getByTestId('clock.jump-dialog.time').fill(time);
  await page.getByTestId('clock.jump-dialog.submit').click();
  await expect(getClock(page)).toHaveText(text, { timeout: 30_000 });
}

/**
 * Opens a depot from the hint of „Kaufen“, transfers 2.000 €, jumps half an hour past the open of
 * the share's exchange and buys one share at market.
 */
async function buyOneShare(page: Page, game: string): Promise<void> {
  await page.goto(`${game}/markets/${INSTRUMENT}`);
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
  await page.getByTestId('banking.transfer-dialog.to').selectOption('acc-2');
  await page.getByTestId('banking.transfer-dialog.amount').fill('2000');
  await page.getByTestId('banking.transfer-dialog.submit').click();
  await expect(page.getByTestId('banking.transfer-dialog.submit')).toHaveCount(0);

  const minute = Number(opens![1]) * 60 + Number(opens![2]) + 30;
  const pad = (value: number): string => String(value).padStart(2, '0');
  const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  await jumpTo(page, '2030-04-01', time, `Mo., 01.04.2030, ${time}`);

  await page.goto(`${game}/markets/${INSTRUMENT}`);
  await expectGameReady(page);
  await page.getByTestId('trading.trade-actions.buy').click();
  await page.getByTestId('trading.order-ticket.quantity').fill('1');
  await expect(page.getByTestId('trading.order-ticket.total')).toBeVisible();
  await page.getByTestId('trading.order-ticket.submit').click();
  await expect(page.getByTestId('trading.order-ticket.submit')).toHaveCount(0);
  await expect(page.getByTestId('trading.trade-actions.position')).toHaveText('Im Depot: 1 Stück');
}

test.describe('portfolio', () => {
  test('shows the position, its detail and the tax year after a purchase', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await buyOneShare(page, game);

    await page.goto(`${game}/portfolio`);
    await expectGameReady(page);
    const row = page.getByTestId('portfolio.positions.row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('portfolio.positions.row.quantity')).toHaveText('1');
    await expect(page.getByTestId('portfolio.allocation')).toBeVisible();
    await expectAccessible(page);

    // The allocation tabs follow the arrow keys.
    const assetClass = page.getByTestId('portfolio.allocation.tabs.asset-class.tab');
    const region = page.getByTestId('portfolio.allocation.tabs.region.tab');
    await assetClass.click();
    await expect(assetClass).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(region).toBeFocused();
    await expect(region).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('portfolio.allocation.region')).toBeVisible();

    // The position's name leads to its detail.
    await row.getByTestId('portfolio.positions.row.name').click();
    await expect(page).toHaveURL(new RegExp(`/portfolio/${INSTRUMENT}$`));
    await expect(page.getByTestId('portfolio.position.quantity')).toHaveText('1');
    await expect(page.getByTestId('portfolio.position.lots.row')).toHaveCount(1);
    await expect(page.getByTestId('portfolio.position.trades.row.side')).toHaveText(['Kauf']);
    await expect(page.getByTestId('market.instrument.chart')).toHaveAttribute(
      'data-markers',
      /^buy:\d+$/,
    );
    await expectAccessible(page);

    await page.goto(`${game}/taxes`);
    await expectGameReady(page);
    await expect(page.getByTestId('taxes.year')).toHaveCount(1);
    await expect(page.getByTestId('taxes.year.year')).toHaveText('2030');
    await expect(page.getByTestId('taxes.year.current')).toBeVisible();
    await expect(page.getByTestId('taxes.year.gains')).toHaveText(/0,00\s€/);
    await expectAccessible(page);
  });
});

test.describe('portfolio on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test('fits depot, position detail and tax page into 360 px', async ({ page }) => {
    // TS §11.4: nothing scrolls horizontally at 360 px.
    await page.setViewportSize({ width: 360, height: 740 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await buyOneShare(page, game);

    await page.goto(`${game}/portfolio`);
    await expectGameReady(page);
    await expect(page.getByTestId('portfolio.positions.list')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await page.goto(`${game}/portfolio/${INSTRUMENT}`);
    await expectGameReady(page);
    await expect(page.getByTestId('portfolio.position.lots')).toBeVisible();
    await expect(page.getByTestId('portfolio.position.trades.row')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await page.goto(`${game}/taxes`);
    await expectGameReady(page);
    await expect(page.getByTestId('taxes.year')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
});
