import { Page } from '@playwright/test';

import {
  getAccountCard,
  getStatementList,
  getStatementSearch,
  getStatementTexts,
  getStatementTotal,
  jumpTo,
  openStatement,
} from './banking.po';
import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady } from './game.po';
import { createPlayer } from './players.po';

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

// Accounts and statement with the real worker and IndexedDB (AP 3.4, US-BK-06). Expected texts come
// from the calendar: the bank run of the first bank working day books the living costs at 06:00
// (E-19); amounts of the model are not asserted.

test.describe('banking', () => {
  test('shows the accounts and the statement, also after a reload', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await jumpTo(page, '2030-04-01', '07:00', 'Mo., 01.04.2030, 07:00');

    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    const card = getAccountCard(page, 'acc-1');
    await expect(card.getByTestId('banking.accounts.card.kind')).toHaveText('Girokonto');
    await expect(card.getByTestId('banking.accounts.card.salary')).toBeVisible();
    await expect(page.getByTestId('banking.accounts.totals.total')).toContainText('€');
    await expectAccessible(page);

    await openStatement(page, 'acc-1');
    await expect(getStatementTexts(page)).toHaveText(['Lebenshaltung April 2030', 'Startkapital']);
    await expect(getStatementTotal(page)).toHaveText('2 Buchungen');
    await expectAccessible(page);

    // The bookings come from IndexedDB after a reload (TS §9.2).
    await page.reload();
    await expectGameReady(page);
    await expect(getStatementTexts(page)).toHaveText(['Lebenshaltung April 2030', 'Startkapital']);
  });

  test('reaches the list with the keyboard and finds nothing for an unknown purpose', async ({
    page,
  }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts/acc-1`);
    await expectGameReady(page);
    await expect(getStatementTexts(page)).toHaveText(['Startkapital']);

    // TS §11.10: the list follows the filter in the tab order and shows its focus.
    await getStatementSearch(page).focus();
    await page.keyboard.press('Tab');
    await expect(getStatementList(page)).toBeFocused();

    await getStatementSearch(page).fill('Urlaub');
    await expect(page.getByTestId('banking.statement.no-matches')).toBeVisible();
    await page.getByTestId('banking.statement.reset-filter').click();
    await expect(getStatementTexts(page)).toHaveText(['Startkapital']);
    await expect(getStatementSearch(page)).toHaveValue('');
  });
});

test.describe('banking on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test('fits the accounts and the statement into 360 px', async ({ page }) => {
    // TS §11.4: nothing scrolls horizontally at 360 px.
    await page.setViewportSize({ width: 360, height: 740 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts`);
    await expect(getAccountCard(page, 'acc-1')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await openStatement(page, 'acc-1');
    await expect(getStatementTexts(page)).toHaveText(['Startkapital']);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
});
