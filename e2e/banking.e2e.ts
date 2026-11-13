import { Page } from '@playwright/test';

import {
  getAccountCard,
  getBankRows,
  getSortButton,
  getStatementList,
  getStatementSearch,
  getStatementTexts,
  getStatementTotal,
  jumpTo,
  openSavingsAccount,
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

// Bank comparison and dialogs (AP 3.5): every flow with the keyboard, axe on the dialogs.
test.describe('banking dialogs', () => {
  test('transfers from start to end with the keyboard only', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await openSavingsAccount(page);

    const transferButton = page.getByTestId('banking.accounts.transfer');
    await transferButton.focus();
    await page.keyboard.press('Enter');
    // The focus starts in the first field; the only other account is preselected.
    await expect(page.getByTestId('banking.transfer-dialog.from')).toBeFocused();
    await expect(page.getByTestId('banking.transfer-dialog.to')).toHaveValue('acc-2');
    await expectAccessible(page);

    // Escape closes the dialog and the focus returns to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('banking.transfer-dialog.from')).toHaveCount(0);
    await expect(transferButton).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('banking.transfer-dialog.from')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('banking.transfer-dialog.to')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('banking.transfer-dialog.amount')).toBeFocused();
    await page.keyboard.type('250');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('banking.transfer-dialog.purpose')).toBeFocused();
    await page.keyboard.type('Sparen');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('banking.transfer-dialog.from')).toHaveCount(0);
    await expect(
      getAccountCard(page, 'acc-2').getByTestId('banking.accounts.card.balance'),
    ).toHaveText('250,00 €');
  });

  test('sorts the bank comparison with the keyboard and opens an account there', async ({
    page,
  }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await page.getByTestId('banking.accounts.banks').click();
    await expect(page).toHaveURL(/\/banks$/);
    await expect(getBankRows(page).first()).toBeVisible();
    await expectAccessible(page);

    const sort = getSortButton(page, 'accountFee');
    await sort.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('th', { has: sort })).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Space');
    await expect(page.locator('th', { has: sort })).toHaveAttribute('aria-sort', 'descending');

    // The last bank in this order offers no current account: a broker, only depots.
    const broker = getBankRows(page).last();
    await broker.getByTestId('banking.banks.row.open-account').click();
    await expect(page.getByTestId('banking.open-account-dialog.bank')).toBeFocused();
    await expect(page.getByTestId('banking.open-account-dialog.kind.depot')).toBeChecked();
    await expect(page.getByTestId('banking.open-account-dialog.kind.current')).toHaveCount(0);
    // The pointer stays where it clicked; a hovered button would be measured in its hover state.
    await page.mouse.move(0, 0);
    await expectAccessible(page);
    // From the bank over the kind and „Abbrechen“ to „Eröffnen“.
    for (const testId of ['kind.depot', 'decline', 'submit']) {
      await page.keyboard.press('Tab');
      await expect(page.getByTestId(`banking.open-account-dialog.${testId}`)).toBeFocused();
    }
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByTestId('banking.accounts.card.kind')).toHaveText([
      'Girokonto',
      'Verrechnungskonto',
    ]);
  });

  test('shows the closing settlement and the monthly overview', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await openSavingsAccount(page);

    await getAccountCard(page, 'acc-1').getByTestId('banking.accounts.card.close').click();
    await expect(
      page.getByTestId('banking.close-account-dialog.blocker.salary-account'),
    ).toBeVisible();
    await expect(page.getByTestId('banking.close-account-dialog.submit')).toBeDisabled();
    await expectAccessible(page);
    await page.keyboard.press('Escape');

    await getAccountCard(page, 'acc-2').getByTestId('banking.accounts.card.close').click();
    await expect(page.getByTestId('banking.close-account-dialog.remainder')).toHaveText('0,00 €');
    await page.getByTestId('banking.close-account-dialog.submit').click();
    await expect(page.getByTestId('banking.accounts.closed.toggle')).toHaveText(
      'Geschlossene Konten (1)',
    );

    await page.getByTestId('banking.accounts.tabs.months.tab').click();
    await expect(page.getByTestId('banking.monthly.row.month')).toHaveText(['April 2030']);
    await expect(page.getByTestId('banking.monthly.row.running')).toBeVisible();
    await expectAccessible(page);
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

  test('fits the bank comparison and the dialogs into 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/banks`);
    await expect(getBankRows(page).first()).toBeVisible();
    // The table scrolls in its own container, the page does not.
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await getBankRows(page).first().getByTestId('banking.banks.row.open-account').click();
    await expect(page.getByTestId('banking.open-account-dialog.bank')).toBeFocused();
    await expectNoHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await expectAccessible(page);
    await page.getByTestId('banking.open-account-dialog.kind.savings').check();
    await page.getByTestId('banking.open-account-dialog.submit').click();

    await expect(page).toHaveURL(/\/accounts$/);
    await page.getByTestId('banking.accounts.transfer').click();
    await expect(page.getByTestId('banking.transfer-dialog.from')).toBeFocused();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
});
