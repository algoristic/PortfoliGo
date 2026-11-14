import { Locator, Page } from '@playwright/test';

import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady, getPausedBadge } from './game.po';
import { createPlayer } from './players.po';
import { storeColorScheme } from './settings.po';

// Accessibility of the main views, dialogs and menus in both colour schemes (NF-09, US-UI-04,
// AP 6.5): axe without serious or critical findings, the central flow with the keyboard only and
// the accessibility tree of a few core elements (TS §11.10).

const COLOR_SCHEMES = ['light', 'dark'] as const;

/** The first share of every world (`stk-0001`, series 0). */
const INSTRUMENT = 'stk-0001';

/** Changes the hash route without a reload, so the game stays loaded between the views. */
async function open(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => {
    location.hash = target;
  }, hash);
  await expect(page).toHaveURL(new RegExp(`${hash.replace(/[/#]/g, '\\$&')}$`));
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

/**
 * Presses Tab (or Shift+Tab) until `target` has the focus, at most `max` times, like a user
 * walking through the page; fails if the target is not reachable that way.
 */
async function tabTo(
  page: Page,
  target: Locator,
  { backward = false, max = 80 }: { backward?: boolean; max?: number } = {},
): Promise<void> {
  for (let step = 0; step < max; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press(backward ? 'Shift+Tab' : 'Tab');
  }
  await expect(target).toBeFocused();
}

/** The focused element shows the focus ring of the tokens (`:focus-visible`, `src/styles.css`). */
async function expectFocusRing(target: Locator): Promise<void> {
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS('outline-style', 'solid');
}

test.describe('accessibility', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'axe results do not depend on the engine',
  );

  for (const colorScheme of COLOR_SCHEMES) {
    test(`has no serious findings outside the game (${colorScheme})`, async ({ page }) => {
      // The appearance is a setting (dark by default, E-06); the system follows the same scheme.
      await storeColorScheme(page, colorScheme);
      await page.emulateMedia({ colorScheme });
      for (const path of ['#/players', '#/players/new', '#/about', '#/lab/components']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectAccessible(page);
      }
      await page.goto('#/lab/simulation');
      await page.getByTestId('lab.simulation.seed').fill('e2e-1');
      await page.getByTestId('lab.simulation.generate').click();
      await expect(page.getByTestId('lab.simulation.game-time')).toBeVisible({ timeout: 30_000 });
      await expectAccessible(page);
    });

    test(`has no serious findings on the views of the game (${colorScheme})`, async ({ page }) => {
      await storeColorScheme(page, colorScheme);
      const game = await createPlayer(page, 'Anna');
      await expectGameReady(page);
      await expectAccessible(page);
      for (const view of [
        'markets',
        'markets/screener',
        'markets/watchlist',
        `markets/${INSTRUMENT}`,
        'portfolio',
        'accounts',
        'accounts/acc-1',
        'banks',
        'orders',
        'taxes',
        'notifications',
        'settings',
        'about',
      ]) {
        await open(page, `${game}/${view}`);
        await expectAccessible(page);
      }
    });

    test(`has no serious findings in dialogs and menus (${colorScheme})`, async ({ page }) => {
      await storeColorScheme(page, colorScheme);
      const game = await createPlayer(page, 'Anna');
      await expectGameReady(page);

      await page.getByTestId('shell.header.player-menu').click();
      await expect(page.getByTestId('shell.header.player-menu.about')).toBeVisible();
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await page.getByTestId('shell.header.jump-button').click();
      await expect(page.getByTestId('clock.jump-dialog.submit')).toBeVisible();
      await expectAccessible(page);
      await page.getByTestId('clock.jump-dialog.decline').click();

      // Depot from the hint of „Kaufen“, money for it, then the order ticket.
      await open(page, `${game}/markets/${INSTRUMENT}`);
      await page.getByTestId('trading.trade-actions.buy').click();
      await page.getByTestId('dialog-confirm.confirm').click();
      await expect(page.getByTestId('banking.open-account-dialog.kind.depot')).toBeChecked();
      await expectAccessible(page);
      await page.getByTestId('banking.open-account-dialog.submit').click();
      await expect(page.getByTestId('banking.open-account-dialog.submit')).toHaveCount(0);

      await open(page, `${game}/accounts`);
      await page.getByTestId('banking.accounts.transfer').click();
      await page.getByTestId('banking.transfer-dialog.to').selectOption('acc-2');
      await expectAccessible(page);
      await page.getByTestId('banking.transfer-dialog.decline').click();

      await open(page, `${game}/markets/${INSTRUMENT}`);
      await page.getByTestId('trading.trade-actions.buy').click();
      await page.getByTestId('trading.order-ticket.quantity').fill('1');
      await expect(page.getByTestId('trading.order-ticket.submit')).toBeVisible();
      await expectAccessible(page);
      await page.getByTestId('trading.order-ticket.decline').click();

      await open(page, `${game}/settings`);
      await page.getByTestId('settings.player.export').click();
      await expect(page.getByTestId('players.export-dialog.file-name')).toBeVisible();
      await expectAccessible(page);
      await page.keyboard.press('Escape');

      await page.goto('#/players');
      await page.getByTestId('players.list.import').click();
      await expect(page.getByTestId('players.import-dialog.submit')).toBeVisible();
      await expectAccessible(page);
    });
  }

  test('has no serious findings with blue and orange for gains and losses', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pgo.settings',
        JSON.stringify({
          v: 1,
          data: { appearance: { colorScheme: 'light', changeColors: 'blue-orange' } },
        }),
      );
    });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await expect(page.locator('html')).toHaveClass(/\bcolors-blue-orange\b/);
    for (const view of ['markets', `markets/${INSTRUMENT}`, 'settings']) {
      await open(page, `${game}/${view}`);
      await expectAccessible(page);
    }
  });
});

test.describe('accessibility on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'axe results do not depend on the engine',
  );

  for (const colorScheme of COLOR_SCHEMES) {
    test(`has no serious findings at 360 px (${colorScheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await storeColorScheme(page, colorScheme);
      await page.goto('#/about');
      await expect(page.getByTestId('about.licenses')).toBeVisible();
      await expectAccessible(page);
      const game = await createPlayer(page, 'Anna');
      await expectGameReady(page);
      await expectAccessible(page);
      await page.getByTestId('shell.bottom-nav.more').click();
      await expect(page.getByTestId('shell.bottom-nav.more.settings')).toBeVisible();
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await open(page, `${game}/markets/${INSTRUMENT}`);
      await expectAccessible(page);
      await open(page, `${game}/about`);
      await expectAccessible(page);
    });
  }
});

test.describe('keyboard', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'Safari moves the focus with Tab only to form controls unless the user changes a setting',
  );

  test('creates a player, opens a depot, moves money and places an order with the keyboard only', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('#/players');
    await tabTo(page, page.getByTestId('players.list.create'));
    await expectFocusRing(page.getByTestId('players.list.create'));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/players\/new$/);
    await tabTo(page, page.getByTestId('players.new.name'));
    await page.keyboard.type('Anna');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/dashboard$/);
    await expectGameReady(page);
    // When the overlay closes, the focus goes to the content (TS §11.10).
    await expect(page.getByTestId('shell.content')).toBeFocused();

    // The clock shortcuts work while the content has the focus.
    await page.keyboard.press(' ');
    await expect(getPausedBadge(page)).toBeHidden();
    await page.keyboard.press(' ');
    await expect(getPausedBadge(page)).toBeVisible();

    // The skip link is the first stop and leads back to the content.
    await tabTo(page, page.getByTestId('shell.skip-to-content'), { backward: true });
    await expect(page.getByTestId('shell.skip-to-content')).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('shell.content')).toBeFocused();

    // Depot at the bank of the salary account.
    await tabTo(page, page.getByTestId('shell.side-nav.accounts'), { backward: true });
    await expectFocusRing(page.getByTestId('shell.side-nav.accounts'));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/accounts$/);
    const openAccount = page.getByTestId('banking.accounts.open-account');
    await tabTo(page, openAccount);
    await page.keyboard.press('Enter');
    // Tab reaches a radio group once; the arrow keys choose within it.
    const depot = page.getByTestId('banking.open-account-dialog.kind.depot');
    await tabTo(page, page.getByRole('dialog').locator('input[type="radio"]:checked'));
    for (let step = 0; step < 5 && !(await depot.isChecked()); step++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(depot).toBeChecked();
    await expect(depot).toBeFocused();
    await tabTo(page, page.getByTestId('banking.open-account-dialog.submit'));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('banking.open-account-dialog.submit')).toHaveCount(0);

    // 2.000 € to the clearing account of the depot; the dialog focuses its first field.
    const transfer = page.getByTestId('banking.accounts.transfer');
    await tabTo(page, transfer, { backward: true });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('banking.transfer-dialog.from')).toBeFocused();
    await expect(page.getByTestId('banking.transfer-dialog.to')).toHaveValue('acc-2');
    await tabTo(page, page.getByTestId('banking.transfer-dialog.amount'));
    await page.keyboard.type('2000');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('banking.transfer-dialog.from')).toHaveCount(0);
    // The focus returns to the button that opened the dialog (CDK).
    await expect(transfer).toBeFocused();

    // A share from the market overview, then „Kaufen“ in the order ticket.
    await tabTo(page, page.getByTestId('shell.side-nav.markets'), { backward: true });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/markets$/);
    const share = page.locator('main a[href*="/markets/stk-"]').first();
    await expect(share).toBeVisible();
    await tabTo(page, share);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/markets\/stk-\d+$/);
    const buy = page.getByTestId('trading.trade-actions.buy');
    await tabTo(page, buy);
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByTestId('trading.order-ticket.quantity'));
    await page.keyboard.type('1');
    await expect(page.getByTestId('trading.order-ticket.total')).toBeVisible();
    await tabTo(page, page.getByTestId('trading.order-ticket.submit'));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('trading.order-ticket.submit')).toHaveCount(0);
    await expect(buy).toBeFocused();

    // The exchange opens later: the order waits in the order book.
    await tabTo(page, page.getByTestId('shell.side-nav.orders'), { backward: true });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('trading.open-orders.row')).toHaveCount(1);
  });
});

test.describe('accessibility tree', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the tree differs between engines');

  test('names the clock bar, the toasts and the order ticket for screen readers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    // The game time is plain text: no live region announces the ticks (TS §11.10).
    await expect(page.getByRole('banner')).toMatchAriaSnapshot(`
      - text: Spielzeit Mo., 01.04.2030, 00:00
      - button "Weiter (Leertaste)"
      - button "Langsamer (−)"
      - 'button "Geschwindigkeit: 1 min/s"'
      - button "Schneller (+)"
      - button "Vorspulen"
      - text: Pausiert
    `);

    await open(page, `${game}/markets/${INSTRUMENT}`);
    await page.getByTestId('trading.trade-actions.buy').click();
    await page.getByTestId('dialog-confirm.confirm').click();
    await page.getByTestId('banking.open-account-dialog.submit').click();
    // The live region was in the document before the toast, and it names the tone.
    await expect(page.locator('app-toast-container')).toMatchAriaSnapshot(`
      - list:
        - listitem:
          - text: "Erledigt:"
          - paragraph: Das Depot mit Verrechnungskonto ist eröffnet.
          - button "Hinweis schließen"
    `);

    await page.getByTestId('trading.trade-actions.buy').click();
    // A dialog has no banner or contentinfo landmarks of its own.
    await expect(page.getByRole('dialog')).toMatchAriaSnapshot(`
      - dialog "Kaufen":
        - heading /.+ kaufen/ [level=2]
        - button "Schließen"
        - combobox "Depot"
        - group "Auftrag":
          - radio "Kaufen" [checked]
          - radio "Verkaufen"
        - textbox "Stückzahl"
        - combobox "Orderart"
        - combobox "Gültigkeit"
        - region "Kostenvorschau"
        - button "Abbrechen"
        - button "Kaufen"
    `);
    await expect(page.getByRole('dialog').getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('contentinfo')).toHaveCount(0);
  });
});
