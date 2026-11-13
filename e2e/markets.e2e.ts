import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady } from './game.po';
import { createPlayer } from './players.po';

// Live chart of the instrument page with the real worker (AP 4.2, US-CH-01): lightweight-charts
// loads lazily on the page and is removed when the page is left. Expected texts come from the
// calendar: before Monday's open at the game start, 1T shows Friday 29.03.2030; model prices are not
// asserted.

/** The first share of every world (`stk-0001`, series 0). */
const INSTRUMENT = 'stk-0001';

test.describe('markets', () => {
  test('shows the live chart of an instrument and removes it when left', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);

    await page.goto(`${game}/markets/${INSTRUMENT}`);
    await expectGameReady(page);
    const chart = page.getByTestId('market.instrument.chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    await expect(page.getByTestId('market.instrument.chart.day')).toHaveText('29.03.2030');
    await expect(chart).not.toHaveAttribute('data-candle-count', '0');
    await expectAccessible(page);

    await page.getByTestId('market.instrument.chart.previous-day').click();
    await expect(page.getByTestId('market.instrument.chart.day')).toHaveText('28.03.2030');

    await page.getByTestId('market.instrument.chart.range.1y').click();
    await expect(page.getByTestId('market.instrument.chart.range.1y')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Daily candles of the year up to Friday 29.03.2030 (the newest starts at 00:00 of that day).
    await expect(chart).toHaveAttribute(
      'data-last-tick',
      String((Date.UTC(2030, 2, 29) - Date.UTC(2020, 0, 1)) / 60_000),
    );
    await page.getByTestId('market.instrument.chart.type.line').click();
    await expect(page.getByTestId('market.instrument.chart.type.line')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
