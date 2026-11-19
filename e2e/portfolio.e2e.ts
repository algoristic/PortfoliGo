import { Page } from '@playwright/test';

import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady } from './game.po';
import { createPlayer } from './players.po';
import { buyOneShare, PORTFOLIO_INSTRUMENT as INSTRUMENT } from './portfolio.po';

// Depot, position detail and tax page with the real worker (AP 5.5, US-PF-02/03/06, US-ST-04): a
// purchase in the open exchange appears as a position, the allocation tabs follow the keyboard,
// the position detail shows its lot and trade, the tax page the running year. Expected values are
// states, texts and share counts; model prices are not asserted.

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
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
