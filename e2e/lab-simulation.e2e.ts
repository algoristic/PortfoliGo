import { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The lab with the real worker (J1–J3). Expected values come from the calendar or the page
// structure, never from model numbers, so that a calibration of the market model (AP 1.9) does not
// break these tests (TS §14.1).

const SEED = 'e2e-1';

/** A market year of the `1y` chart: 52 weeks of five market days (TS §6.8). */
const MARKET_DAYS_PER_YEAR = 260;

async function generateWorld(page: Page): Promise<void> {
  await page.goto('#/lab/simulation');
  await page.getByTestId('lab.simulation.seed').fill(SEED);
  await page.getByTestId('lab.simulation.generate').click();
  // The game starts on 01.04.2030 00:00; the world stands one minute before (TS §3.1).
  await expect(page.getByTestId('lab.simulation.game-time')).toContainText(
    'So., 31.03.2030, 23:59',
    { timeout: 30_000 },
  );
}

async function candleCount(page: Page): Promise<number> {
  const text = await page.getByTestId('lab.simulation.chart.candle-count').textContent();
  return Number((text ?? '').replace(/\D/g, ''));
}

test.describe('lab simulation', () => {
  test(
    'generates a world in the worker, simulates and computes statistics',
    { tag: '@intl' },
    async ({ page }) => {
      await generateWorld(page);
      await expect(page.getByTestId('lab.simulation.chart.candle-count')).toHaveText(
        `${MARKET_DAYS_PER_YEAR} Kerzen`,
      );

      await page.getByTestId('lab.simulation.simulate.7').click();
      await expect(page.getByTestId('lab.simulation.game-time')).toContainText(
        'So., 07.04.2030, 23:59',
      );
      await expect(page.getByTestId('lab.simulation.chart.candle-count')).toHaveText(
        `${MARKET_DAYS_PER_YEAR} Kerzen`,
      );

      await page.getByTestId('lab.simulation.statistics.compute').click();
      await expect(page.getByTestId('lab.simulation.statistics.targets')).toBeVisible({
        timeout: 30_000,
      });
      const values = page.locator(
        '[data-testid^="lab.simulation.statistics.target."][data-testid$=".value"]',
      );
      expect(await values.count()).toBeGreaterThan(0);
      for (const value of await values.allTextContents()) {
        // de-DE in every engine and for every locale and time zone of the browser (TS §11.9).
        expect(value.trim()).toMatch(/^(–|−?-?\d{1,3}(\.\d{3})*(,\d+)?\s?%?)$/);
      }
    },
  );

  test('switches ranges and resolutions and loads older candles when zooming out', async ({
    page,
  }) => {
    await generateWorld(page);
    await page.getByTestId('lab.simulation.chart.range.1w').click();
    await page.getByTestId('lab.simulation.chart.resolution.1h').click();
    const hourly = await candleCount(page);
    await page.getByTestId('lab.simulation.chart.resolution.15m').click();
    await expect.poll(() => candleCount(page)).not.toBe(hourly);
    const quarterHourly = await candleCount(page);
    expect(quarterHourly).toBeGreaterThan(hourly);

    // Switching back and forth shows exactly the same candles again.
    await page.getByTestId('lab.simulation.chart.resolution.1h').click();
    await expect.poll(() => candleCount(page)).toBe(hourly);
    await page.getByTestId('lab.simulation.chart.resolution.15m').click();
    await expect.poll(() => candleCount(page)).toBe(quarterHourly);

    // The chart stacks several canvases; the pointer goes to the topmost one in the centre.
    await page.getByTestId('lab.simulation.chart').hover();
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, 400);
          return candleCount(page);
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(quarterHourly);
    await expect(page.getByTestId('lab.simulation.chart.loading-history')).toHaveCount(0);
  });

  test('starts a new worker after leaving and reopening the page', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'the worker lifecycle does not depend on the engine');
    await generateWorld(page);
    await page.getByTestId('lab.simulation.simulate.7').click();
    await expect(page.getByTestId('lab.simulation.game-time')).toContainText('07.04.2030');

    await page.getByTestId('lab.nav.components').click();
    await expect(page).toHaveURL(/#\/lab\/components$/);
    await page.getByTestId('lab.nav.simulation').click();

    await generateWorld(page);
    await page.getByTestId('lab.simulation.simulate.1').click();
    await expect(page.getByTestId('lab.simulation.game-time')).toContainText(
      'Mo., 01.04.2030, 23:59',
    );
  });
});
