import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import { SubscriptionPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { byTestId, click, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseGermanNumber } from '../../../../testing/parse';
import { installScrollViewport, scrollTo } from '../../../../testing/scroll-viewport';
import { SCREENER_SCROLL_THROTTLE_MS, SCREENER_SEARCH_DEBOUNCE_MS } from '../state/market.model';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

/** Viewport of the list: ten rows of 56 px (`h-14`). */
const ROW_PX = 56;
const VISIBLE_ROWS = 10;

const COLLATOR = new Intl.Collator('de', { sensitivity: 'base' });

/** Sorted by name with the German collation, ties in series order (TS §8.2). */
function byName(instruments: readonly Instrument[]): Instrument[] {
  return [...instruments].sort((a, b) => COLLATOR.compare(a.name, b.name) || a.series - b.series);
}

describe('ScreenerPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let instruments: Instrument[];

  beforeEach(async () => {
    localStorage.clear();
    onTestFinished(installScrollViewport(VISIBLE_ROWS * ROW_PX));
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    playerId = profile.id;
  });

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
    await run(200);
  }

  /** Real time for debounced and throttled steps, then the engine. */
  async function wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await run(200);
  }

  async function openScreener(): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/markets`);
    await run(300);
    await act(() => click(byTestId(page, 'market.nav.screener')));
    await run(300);
    // The subscription of the visible rows follows the first result after the throttle.
    await wait(SCREENER_SCROLL_THROTTLE_MS + 50);
    ({ instruments } = await firstValueFrom(TestBed.inject(EngineService).instruments()));
  }

  function total(): number {
    return parseGermanNumber(textOf(byTestId(page, 'market.screener.total.count')));
  }

  function rowIds(): string[] {
    return [...page.querySelectorAll<HTMLElement>('[data-testid="market.screener.row"]')].map(
      (row) => row.getAttribute('data-instrument-id') ?? '',
    );
  }

  function subscribed(): Set<number> {
    const series = new Set<number>();
    for (const message of engine.current?.received ?? []) {
      const payload = message.payload as SubscriptionPayload;
      if (message.type === 'subscribe') {
        payload.series.forEach((s) => series.add(s));
      } else if (message.type === 'unsubscribe') {
        payload.series.forEach((s) => series.delete(s));
      }
    }
    return series;
  }

  it('lists every instrument by name and opens a row', async () => {
    await openScreener();
    expect(harness.routeNativeElement?.ownerDocument.title).toContain('Screener');
    expect(total()).toBe(instruments.length);
    const sorted = byName(instruments);
    expect(rowIds().slice(0, VISIBLE_ROWS)).toEqual(
      sorted.slice(0, VISIBLE_ROWS).map((instrument) => instrument.id),
    );
    expect(
      byTestId(page, 'market.screener.sort.name')
        .closest('[role="columnheader"]')
        ?.getAttribute('aria-sort'),
    ).toBe('ascending');

    const first = byTestId(page, 'market.screener.row');
    expect(byTestId(first, 'market.screener.row.name').getAttribute('href')).toBe(
      `/game/${playerId}/markets/${sorted[0].id}`,
    );
  });

  it('searches by name, ticker and identifier after a pause in typing', async () => {
    await openScreener();
    const stock = instruments.find((instrument) => instrument.kind === 'stock');
    if (stock === undefined || stock.isin === null) {
      throw new Error('The world has no share');
    }
    const search = byTestId<HTMLInputElement>(page, 'market.screener.filter.search');

    for (const text of [stock.ticker.toLowerCase(), stock.isin, stock.name.slice(0, 4)]) {
      typeText(search, text);
      await wait(SCREENER_SEARCH_DEBOUNCE_MS + 50);
      const expected = instruments.filter((instrument) =>
        [instrument.name, instrument.ticker, instrument.isin ?? ''].some((field) =>
          field.toLowerCase().includes(text.toLowerCase()),
        ),
      );
      expect(total()).toBe(expected.length);
      expect(rowIds()).toEqual(
        byName(expected)
          .slice(0, rowIds().length)
          .map(({ id }) => id),
      );
    }
  });

  it('combines filters and resets them', async () => {
    await openScreener();
    const open = async (dimension: string): Promise<void> => {
      const details = byTestId<HTMLDetailsElement>(page, `market.screener.filter.${dimension}`);
      details.open = true;
      await settle(harness.fixture);
    };
    const check = async (dimension: string, value: string): Promise<void> => {
      await open(dimension);
      await act(() => click(byTestId(page, `market.screener.filter.${dimension}.${value}`)));
    };

    // Shares OR ETFs, in Europe OR North America, of the technology sector (AND between them).
    await check('assetClasses', 'stock');
    await check('assetClasses', 'etf');
    await check('regions', 'europe');
    await check('regions', 'north-america');
    await check('sectors', 'technology');
    const expected = instruments.filter(
      (instrument) =>
        (instrument.kind === 'stock' || instrument.kind === 'etf') &&
        (instrument.regionId === 'europe' || instrument.regionId === 'north-america') &&
        instrument.sectorId === 'technology',
    );
    expect(total()).toBe(expected.length);
    expect(rowIds()).toEqual(
      byName(expected)
        .slice(0, rowIds().length)
        .map(({ id }) => id),
    );
    expect(textOf(byTestId(page, 'market.screener.filter.regions.count'))).toBe('2');

    // A dividend yield of at least 2 %: indices have none and drop out.
    const minYield = byTestId<HTMLInputElement>(page, 'market.screener.filter.yield-min');
    minYield.value = '2';
    await act(() => minYield.dispatchEvent(new Event('change')));
    const yields = [...page.querySelectorAll('[data-testid="market.screener.row.yield"]')].map(
      (cell) => parseGermanNumber(textOf(cell)),
    );
    expect(total()).toBeLessThanOrEqual(expected.length);
    expect(yields.every((value) => value >= 0.02)).toBe(true);

    await act(() => click(byTestId(page, 'market.screener.filter.reset')));
    expect(total()).toBe(instruments.length);
    expect(minYield.value).toBe('');
  });

  it('sorts by performance and dividend yield with missing values last', async () => {
    await openScreener();
    await act(() => click(byTestId(page, 'market.screener.sort.y1')));
    const header = byTestId(page, 'market.screener.sort.y1');
    expect(header.getAttribute('aria-pressed')).toBe('true');
    expect(header.closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('descending');
    const performances = (): number[] =>
      [...page.querySelectorAll('[data-testid="market.screener.row.performance"]')].map((cell) =>
        parseGermanNumber(textOf(cell)),
      );
    const descending = performances();
    expect(descending.length).toBeGreaterThan(1);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));

    await act(() => click(byTestId(page, 'market.screener.sort.y1')));
    const ascending = performances();
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    // Indices have no dividend yield: sorted by yield they come last in both directions.
    await act(() => click(byTestId(page, 'market.screener.sort.dividendYield')));
    const viewport = byTestId(page, 'market.screener.viewport');
    scrollTo(viewport, instruments.length * ROW_PX);
    await wait(SCREENER_SCROLL_THROTTLE_MS + 100);
    const lastKinds = [...page.querySelectorAll('[data-testid="market.screener.row.kind"]')].map(
      (cell) => textOf(cell),
    );
    expect(lastKinds.at(-1)).toBe('Index');
  });

  it('watches the quotes of the visible rows only, follows scrolling and ends when left', async () => {
    await openScreener();
    const sorted = byName(instruments);
    const watched = (): Set<number> => subscribed();
    // Ten visible rows and a buffer of ten after them.
    const first = new Set(sorted.slice(0, 20).map(({ series }) => series));
    for (const series of first) {
      expect(watched().has(series)).toBe(true);
    }
    expect(watched().has(sorted[40].series)).toBe(false);

    scrollTo(byTestId(page, 'market.screener.viewport'), 50 * ROW_PX);
    await wait(SCREENER_SCROLL_THROTTLE_MS + 100);
    for (const { series } of sorted.slice(50, 60)) {
      expect(watched().has(series)).toBe(true);
    }
    expect(watched().has(sorted[0].series)).toBe(false);

    await harness.navigateByUrl(`/game/${playerId}/accounts`);
    await run(300);
    for (const { series } of sorted.slice(40, 70)) {
      expect(watched().has(series)).toBe(false);
    }
  });
});
