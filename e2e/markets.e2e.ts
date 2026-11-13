import { Page } from '@playwright/test';

import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady } from './game.po';
import { createPlayer } from './players.po';
import { storeColorScheme } from './settings.po';

// Live chart of the instrument page with the real worker (AP 4.2, US-CH-01): lightweight-charts
// loads lazily on the page and is removed when the page is left. Expected texts come from the
// calendar: before Monday's open at the game start, 1T shows Friday 29.03.2030; model prices are not
// asserted.

/** The first share of every world (`stk-0001`, series 0). */
const INSTRUMENT = 'stk-0001';
/** The first ETF of every world. */
const ETF = 'etf-0001';

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

  test('shows the overview with indices, movers and the sector heat map', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/markets`);
    await expectGameReady(page);

    await expect(page.getByTestId('market.nav.overview')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('market.overview.index').first()).toBeVisible();
    await expect(page.getByTestId('market.overview.index.sparkline').first()).toBeVisible();
    // Five gainers and five losers (TS §8.4), one tile per sector (TS §5.5: eleven sectors).
    await expect(page.getByTestId('market.overview.gainers.row')).toHaveCount(5);
    await expect(page.getByTestId('market.overview.losers.row')).toHaveCount(5);
    await expect(page.getByTestId('market.overview.sector')).toHaveCount(11);
    // The game starts on Mon 01.04.2030 at 00:00, before any exchange opens.
    await expect(page.getByTestId('market.overview.closed')).toBeVisible();
    await expect(page.getByTestId('market.overview.region')).toHaveCount(4);
    await expectAccessible(page);

    await page.getByTestId('market.overview.sector').first().click();
    await expect(page).toHaveURL(/\/markets\/[^/]+$/);
    await expect(page.getByTestId('market.instrument.name')).not.toHaveText('Instrument');
  });

  test('filters, sorts and opens the matches of the screener', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/markets`);
    await expectGameReady(page);
    await page.getByTestId('market.nav.screener').click();
    await expect(page).toHaveURL(/\/markets\/screener$/);

    const total = page.getByTestId('market.screener.total.count');
    await expect(page.getByTestId('market.screener.row').first()).toBeVisible();
    const all = await readCount(page);

    await page.getByTestId('market.screener.filter.assetClasses.toggle').click();
    await page.getByTestId('market.screener.filter.assetClasses.stock').check();
    await page.getByTestId('market.screener.filter.regions.toggle').click();
    await page.getByTestId('market.screener.filter.regions.europe').check();
    await expect(total).not.toHaveText(String(all));
    const kinds = page.getByTestId('market.screener.row.kind');
    await expect(kinds.first()).toHaveText('Aktie');
    expect(new Set(await kinds.allTextContents())).toEqual(new Set(['Aktie']));
    await expectAccessible(page);

    await page.getByTestId('market.screener.sort.y1').click();
    await expect(page.getByTestId('market.screener.sort.y1')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('market.screener.filter.search').fill('zzzzzz');
    await expect(page.getByTestId('market.screener.empty')).toBeVisible();
    await page.getByTestId('market.screener.filter.reset').click();
    await expect(total).toHaveText(new Intl.NumberFormat('de-DE').format(all));

    const first = page.getByTestId('market.screener.row').first();
    const name = (await first.getByTestId('market.screener.row.name').textContent())?.trim();
    await first.getByTestId('market.screener.row.name').click();
    await expect(page).toHaveURL(/\/markets\/[^/]+$/);
    await expect(page.getByTestId('market.instrument.name')).toHaveText(name ?? '');
  });

  test('fills the watchlist, reorders it by dragging and keeps it after a reload', async ({
    page,
  }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/markets/watchlist`);
    await expectGameReady(page);
    await expect(page.getByTestId('market.watchlist.empty')).toBeVisible();
    await expectAccessible(page);

    await page.getByTestId('market.watchlist.open-screener').click();
    await expect(page).toHaveURL(/\/markets\/screener$/);
    const rows = page.getByTestId('market.screener.row');
    await expect(rows.first()).toBeVisible();
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const row = rows.nth(index);
      ids.push((await row.getAttribute('data-instrument-id')) ?? '');
      await row.getByTestId('market.screener.row.watchlist').click();
      await expect(row.getByTestId('market.screener.row.watchlist')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }

    await page.getByTestId('market.nav.watchlist').click();
    const watchlist = page.getByTestId('market.watchlist.row');
    await expect(watchlist).toHaveCount(3);
    expect(await watchlistIds(page)).toEqual(ids);
    await expect(page.getByTestId('market.watchlist.row.price').first()).not.toHaveText('–');
    await expectAccessible(page);

    // Drag the first row by its grip below the last one.
    await dragRow(page, 0, 2);
    const reordered = [ids[1], ids[2], ids[0]];
    await expect.poll(() => watchlistIds(page)).toEqual(reordered);

    await page.reload();
    await expectGameReady(page);
    await expect(watchlist).toHaveCount(3);
    expect(await watchlistIds(page)).toEqual(reordered);
  });

  test('fits the overview, the screener and the watchlist into 360 px', async ({ page }) => {
    // TS §11.4: nothing scrolls horizontally at 360 px.
    await page.setViewportSize({ width: 360, height: 740 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/markets`);
    await expectGameReady(page);
    await expect(page.getByTestId('market.overview.sector').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByTestId('market.nav.screener').click();
    await expect(page.getByTestId('market.screener.row').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
    await page.getByTestId('market.screener.row.watchlist').first().click();
    await page.getByTestId('market.nav.watchlist').click();
    await expect(page.getByTestId('market.watchlist.row')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });

  // AP 4.5 (US-MK-03): the details of a share and an ETF with the real worker, in both colour
  // schemes. The game starts on Mon 01.04.2030 at 00:00, before any exchange opens.
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`shows the details of a share and an ETF (${colorScheme})`, async ({ page }) => {
      await storeColorScheme(page, colorScheme);
      await page.emulateMedia({ colorScheme });
      const game = await createPlayer(page, 'Anna');
      await expectGameReady(page);

      await page.goto(`${game}/markets/${INSTRUMENT}`);
      await expectGameReady(page);
      await expect(page.getByTestId('market.instrument.kind')).toHaveText('Aktie');
      await expect(page.getByTestId('market.instrument.bid')).toContainText('€');
      await expect(page.getByTestId('market.instrument.spread-percent')).toContainText('%)');
      await expect(page.getByTestId('market.instrument.status')).toContainText(
        'Geschlossen · öffnet',
      );
      await expect(page.getByTestId('market.instrument.closed')).toBeVisible();
      await expect(page.getByTestId('market.instrument.figures.volatility')).toContainText('%');
      await expect(page.getByTestId('market.instrument.profile.description')).not.toBeEmpty();
      await expect(
        page.getByTestId('market.instrument.profile.indices.item').first(),
      ).toBeVisible();
      await expect(page.getByTestId('market.instrument.dividends')).toBeVisible();
      await expect(
        page.getByTestId('market.instrument.chart').locator('canvas').first(),
      ).toBeVisible();
      await expectAccessible(page);

      await page.goto(`${game}/markets/${ETF}`);
      await expectGameReady(page);
      await expect(page.getByTestId('market.instrument.kind')).toHaveText('ETF');
      await expect(page.getByTestId('market.instrument.inav-tick')).toHaveText('Stand Mo., 00:00');
      await expect(page.getByTestId('market.instrument.profile.ter')).toContainText('%');
      await expect(page.getByTestId('market.instrument.profile.issuer')).not.toBeEmpty();
      await expect(page.getByTestId('market.instrument.profile.index')).toBeVisible();
      // The first figures of an ETF take longest (TS §14.3: about 0.4 s cold).
      await expect(page.getByTestId('market.instrument.figures.size')).toContainText('€');
      await expect(page.getByTestId('market.instrument.composition.top.row')).toHaveCount(10);
      await expect(
        page.getByTestId('market.instrument.composition.regions.item').first(),
      ).toBeVisible();
      await expectAccessible(page);

      // The tracked index opens in place, without bid and ask.
      await page.getByTestId('market.instrument.profile.index').click();
      await expect(page.getByTestId('market.instrument.kind')).toHaveText('Index');
      await expect(page.getByTestId('market.instrument.bid')).toHaveCount(0);
      await expect(page.getByTestId('market.instrument.composition.top.row')).toHaveCount(10);
    });
  }

  test('fits the instrument page into 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    for (const id of [INSTRUMENT, ETF]) {
      await page.goto(`${game}/markets/${id}`);
      await expectGameReady(page);
      await expect(page.getByTestId('market.instrument.figures.y5')).toContainText('%');
      await expect(
        page
          .getByTestId('market.instrument.profile.description')
          .or(page.getByTestId('market.instrument.composition.top.row').first()),
      ).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await expectAccessible(page);
  });
});

async function watchlistIds(page: Page): Promise<string[]> {
  return page
    .getByTestId('market.watchlist.row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-instrument-id') ?? ''));
}

/** Drags a watchlist row by its grip onto the position of another row, in small steps like a hand. */
async function dragRow(page: Page, from: number, to: number): Promise<void> {
  const handle = page.getByTestId('market.watchlist.row.handle').nth(from);
  const target = page.getByTestId('market.watchlist.row').nth(to);
  const start = await handle.boundingBox();
  const end = await target.boundingBox();
  if (start === null || end === null) {
    throw new Error('The watchlist rows are not visible');
  }
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 10, { steps: 5 });
  await page.mouse.move(start.x + start.width / 2, end.y + end.height * 0.75, { steps: 20 });
  await page.mouse.up();
}

async function readCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('market.screener.total.count').textContent()) ?? '';
  return Number(text.replace(/\./g, ''));
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}
