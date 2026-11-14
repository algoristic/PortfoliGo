import { Page } from '@playwright/test';

import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady, getClock, getSpeed } from './game.po';
import { createPlayer } from './players.po';

// Dashboard with the real worker (AP 5.7, US-PF-01/04/05, US-UI-10, US-MK-06): „Erste Schritte“
// tick off with the player's own actions, the tiles show, the period follows the keyboard, the net
// worth history grows with a jump of some weeks and stays after a reload (store `series`). Expected
// values are states, texts and day counts; model prices are not asserted.

/** The first share and the first ETF of every world. */
const SHARE = 'stk-0001';
const ETF = 'etf-0001';

const TILES = [
  'net-worth',
  'history',
  'performance',
  'upcoming',
  'cashflow',
  'top-positions',
  'dividends',
  'watchlist',
  'notifications',
];

const STEPS = ['compare-banks', 'open-depot', 'transfer', 'first-purchase', 'savings-plan'];

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

async function openDashboard(page: Page, game: string): Promise<void> {
  await page.goto(`${game}/dashboard`);
  await expectGameReady(page);
  await expect(page.getByTestId('dashboard.net-worth')).toBeVisible();
}

/**
 * The five first steps: the bank comparison, a depot from the hint of „Kaufen“, a transfer of
 * 2.000 €, one share at market half an hour after the open of its exchange, a savings plan on an
 * ETF.
 */
async function takeFirstSteps(page: Page, game: string): Promise<void> {
  await page.goto(`${game}/banks`);
  await expectGameReady(page);

  await page.goto(`${game}/markets/${SHARE}`);
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

  await page.goto(`${game}/markets/${SHARE}`);
  await expectGameReady(page);
  await page.getByTestId('trading.trade-actions.buy').click();
  await page.getByTestId('trading.order-ticket.quantity').fill('1');
  await expect(page.getByTestId('trading.order-ticket.total')).toBeVisible();
  await page.getByTestId('trading.order-ticket.submit').click();
  await expect(page.getByTestId('trading.order-ticket.submit')).toHaveCount(0);
  await expect(page.getByTestId('trading.trade-actions.position')).toHaveText('Im Depot: 1 Stück');

  await page.goto(`${game}/markets/${ETF}`);
  await expectGameReady(page);
  await page.getByTestId('trading.trade-actions.savings-plan').click();
  await page.getByTestId('trading.savings-plan-dialog.amount').fill('100');
  await page.getByTestId('trading.savings-plan-dialog.submit').click();
  await expect(page.getByTestId('trading.savings-plan-dialog.submit')).toHaveCount(0);
}

test.describe('dashboard', () => {
  test('ticks the first steps, switches the period and keeps the history after a reload', async ({
    page,
  }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await expect(page.getByTestId('dashboard.first-steps.progress')).toHaveText('0 von 5 erledigt');
    for (const step of STEPS) {
      await expect(page.getByTestId(`dashboard.first-steps.${step}`)).toHaveAttribute(
        'data-done',
        'false',
      );
    }
    await expectAccessible(page);

    await takeFirstSteps(page, game);
    await openDashboard(page, game);
    await expect(page.getByTestId('dashboard.first-steps.progress')).toHaveText('5 von 5 erledigt');
    for (const step of STEPS) {
      await expect(page.getByTestId(`dashboard.first-steps.${step}`)).toHaveAttribute(
        'data-done',
        'true',
      );
    }
    for (const tile of TILES) {
      await expect(page.getByTestId(`dashboard.${tile}`)).toBeVisible();
    }
    await expect(page.getByTestId('dashboard.top-positions.row')).toHaveCount(1);

    // The period buttons work with the keyboard.
    const month = page.getByTestId('dashboard.history.range.1m');
    const max = page.getByTestId('dashboard.history.range.max');
    await month.focus();
    await page.keyboard.press('Enter');
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    await max.focus();
    await page.keyboard.press('Space');
    await expect(max).toHaveAttribute('aria-pressed', 'true');
    await expect(month).toHaveAttribute('aria-pressed', 'false');

    // Five weeks on: one point per ended day from Mo 01.04. to Mo 06.05.2030.
    await jumpTo(page, '2030-05-06', '10:00', 'Mo., 06.05.2030, 10:00');
    const chart = page.getByTestId('dashboard.history.chart');
    await expect(chart).toHaveAttribute('data-candle-count', '35', { timeout: 30_000 });
    const netWorth = await page.getByTestId('dashboard.net-worth.value').textContent();
    const sinceStart = await page.getByTestId('dashboard.net-worth.since-start').textContent();
    const summary = await page.getByTestId('dashboard.history.summary').textContent();
    await expectAccessible(page);

    // Reload: figures and history come back from the stored state and series.
    await page.reload();
    await expectGameReady(page);
    await expect(getClock(page)).toHaveText('Mo., 06.05.2030, 10:00');
    await page.getByTestId('dashboard.history.range.max').click();
    await expect(chart).toHaveAttribute('data-candle-count', '35', { timeout: 30_000 });
    await expect(page.getByTestId('dashboard.net-worth.value')).toHaveText(netWorth ?? '');
    await expect(page.getByTestId('dashboard.net-worth.since-start')).toHaveText(sinceStart ?? '');
    await expect(page.getByTestId('dashboard.history.summary')).toHaveText(summary ?? '');

    // Hidden „Erste Schritte“ come back with the button below the tiles.
    await page.getByTestId('dashboard.first-steps.hide').click();
    await expect(page.getByTestId('dashboard.first-steps')).toHaveCount(0);
    await page.getByTestId('dashboard.first-steps.show').click();
    await expect(page.getByTestId('dashboard.first-steps')).toBeVisible();

    // Earnings and costs on the accounts page: the order fee of the purchase in 2030.
    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await page.getByTestId('banking.accounts.tabs.income-costs.tab').click();
    const year = page.getByTestId('banking.income-costs.2030');
    await expect(year).toBeVisible();
    await expect(year.getByTestId('banking.income-costs.running')).toBeVisible();
    await expect(year.locator('tr[data-testid^="banking.income-costs.2030.month."]')).toHaveCount(
      2,
    );
    await expectAccessible(page);
  });
});

test.describe('dashboard on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test('stacks the tiles into 360 px', async ({ page }) => {
    // TS §11.4: nothing scrolls horizontally at 360 px.
    await page.setViewportSize({ width: 360, height: 740 });
    await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await expect(page.getByTestId('dashboard.first-steps')).toBeVisible();
    for (const tile of TILES) {
      await expect(page.getByTestId(`dashboard.${tile}`)).toBeAttached();
    }
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
});
