import { Page } from '@playwright/test';

import { jumpTo } from './banking.po';
import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady } from './game.po';
import { createPlayer } from './players.po';

// Trading with the real worker (AP 5.4, US-HD-01–04): a depot from the hint of „Kaufen“, a limit
// order that survives a reload (write-ahead, TS §9.3), its cancellation from the order book and a
// market purchase in the open exchange. Expected values are states, texts and share counts; model
// prices are not asserted. A new game rests paused before every open, so the limit order stays
// open whatever the share's price until the test jumps.

/** The first share of every world (`stk-0001`, series 0). */
const INSTRUMENT = 'stk-0001';

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

/** Opens a depot at the salary account's bank from the hint of „Kaufen“ and transfers 2.000 €. */
async function openDepotWithMoney(page: Page, game: string): Promise<void> {
  await page.goto(`${game}/markets/${INSTRUMENT}`);
  await expectGameReady(page);
  await page.getByTestId('trading.trade-actions.buy').click();
  await page.getByTestId('dialog-confirm.confirm').click();
  // The hint preselects the kind „Depot“.
  await expect(page.getByTestId('banking.open-account-dialog.kind.depot')).toBeChecked();
  await page.getByTestId('banking.open-account-dialog.submit').click();
  await expect(page.getByTestId('banking.open-account-dialog.submit')).toHaveCount(0);

  await page.goto(`${game}/accounts`);
  await expectGameReady(page);
  await page.getByTestId('banking.accounts.transfer').click();
  await page.getByTestId('banking.transfer-dialog.to').selectOption('acc-2');
  await page.getByTestId('banking.transfer-dialog.amount').fill('2000');
  await page.getByTestId('banking.transfer-dialog.submit').click();
  await expect(page.getByTestId('banking.transfer-dialog.submit')).toHaveCount(0);
}

/** Places a purchase of one share from the instrument page, at a limit of 1,00 € when asked. */
async function buyOne(page: Page, game: string, kind: 'limit' | 'market'): Promise<void> {
  await page.goto(`${game}/markets/${INSTRUMENT}`);
  await expectGameReady(page);
  await page.getByTestId('trading.trade-actions.buy').click();
  await page.getByTestId('trading.order-ticket.quantity').fill('1');
  if (kind === 'limit') {
    await page.getByTestId('trading.order-ticket.type').selectOption('limit');
    await page.getByTestId('trading.order-ticket.limit').fill('1');
    await page.getByTestId('trading.order-ticket.validity').selectOption('gtc');
  }
  await expect(page.getByTestId('trading.order-ticket.total')).toBeVisible();
  await page.getByTestId('trading.order-ticket.submit').click();
  await expect(page.getByTestId('trading.order-ticket.submit')).toHaveCount(0);
}

test.describe('trading', () => {
  test('keeps a limit order over a reload, cancels it and buys in the open exchange', async ({
    page,
  }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await openDepotWithMoney(page, game);

    // The game starts before the open: the status names the opening time of the share's exchange.
    await page.goto(`${game}/markets/${INSTRUMENT}`);
    await expectGameReady(page);
    const status = await page.getByTestId('market.instrument.status').textContent();
    const opens = /öffnet Mo\., (\d{2}):(\d{2})/.exec(status ?? '');
    expect(opens).not.toBeNull();

    await page.getByTestId('trading.trade-actions.buy').click();
    await expect(page.getByTestId('trading.order-ticket.market-closed')).toBeVisible();
    await expectAccessible(page);
    await page.getByTestId('trading.order-ticket.decline').click();
    await buyOne(page, game, 'limit');

    await page.goto(`${game}/orders`);
    await expectGameReady(page);
    const rows = page.getByTestId('trading.open-orders.row');
    await expect(rows).toHaveCount(1);
    await expect(rows.getByTestId('trading.open-orders.row.status')).toHaveText('Offen');
    await expect(rows.getByTestId('trading.open-orders.row.limit')).toHaveText(/^1,000?\s€$/);
    await expect(page.getByTestId('trading.open-orders.reservation')).toHaveCount(1);
    await expectAccessible(page);

    // The order was written ahead of the reply, so it is there after a reload (TS §9.3).
    await page.reload();
    await expectGameReady(page);
    await expect(rows).toHaveCount(1);
    await expect(rows.getByTestId('trading.open-orders.row.size')).toHaveText('1 Stück');

    // Change with the keyboard: the focus starts in the limit, Escape returns it to the button.
    const change = rows.getByTestId('trading.open-orders.row.change');
    await change.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('trading.change-order.limit')).toBeFocused();
    await expect(page.getByTestId('trading.change-order.limit')).toHaveValue(/^1,000?$/);
    await expectAccessible(page);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1,5');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('trading.change-order.limit')).toHaveCount(0);
    await expect(rows.getByTestId('trading.open-orders.row.limit')).toHaveText(/^1,500?\s€$/);

    await rows.getByTestId('trading.open-orders.row.cancel').click();
    await page.getByTestId('dialog-confirm.confirm').click();
    await expect(page.getByTestId('trading.open-orders.empty')).toBeVisible();
    await expect(page.getByTestId('trading.open-orders.reservations')).toHaveCount(0);
    await page.getByTestId('trading.orders.tabs.history.tab').click();
    await expect(page.getByTestId('trading.order-history.row.status')).toHaveText(['Storniert']);

    // A market purchase while the share's exchange trades executes at once.
    const minute = Number(opens![1]) * 60 + Number(opens![2]) + 30;
    const pad = (value: number): string => String(value).padStart(2, '0');
    const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
    await jumpTo(page, '2030-04-01', time, `Mo., 01.04.2030, ${time}`);
    await buyOne(page, game, 'market');
    await expect(page.getByTestId('trading.trade-actions.position')).toHaveText(
      'Im Depot: 1 Stück',
    );
    await page.goto(`${game}/orders`);
    await expectGameReady(page);
    await page.getByTestId('trading.orders.tabs.history.tab').click();
    await expect(page.getByTestId('trading.order-history.row.status')).toHaveText([
      'Ausgeführt',
      'Storniert',
    ]);
    await expect(page.getByTestId('trading.order-history.row.executed')).toContainText(
      '1 Stück zu',
    );
    await expectAccessible(page);
  });
});

test.describe('trading on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test('fits the order ticket and the order book into 360 px', async ({ page }) => {
    // TS §11.4: nothing scrolls horizontally at 360 px.
    await page.setViewportSize({ width: 360, height: 740 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await openDepotWithMoney(page, game);

    await page.goto(`${game}/markets/${INSTRUMENT}`);
    await expectGameReady(page);
    await page.getByTestId('trading.trade-actions.buy').click();
    await page.getByTestId('trading.order-ticket.quantity').fill('1');
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
    // The actions stay in view while the ticket scrolls.
    await expect(page.getByTestId('trading.order-ticket.submit')).toBeInViewport();
    await page.getByTestId('trading.order-ticket.decline').click();
    await buyOne(page, game, 'limit');

    await page.goto(`${game}/orders`);
    await expectGameReady(page);
    await expect(page.getByTestId('trading.open-orders.row')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
    await page.getByTestId('trading.open-orders.row.change').click();
    await expect(page.getByTestId('trading.change-order.limit')).toBeFocused();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
});
