import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Subscription } from 'rxjs';

import { EngineService } from '@app/engine/data-access/service/engine.service';
import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { MAX_WATCHLIST_LENGTH } from '@app/market/domain/models/watchlist.model';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros, parseGermanNumber } from '../../../../testing/parse';
import { installScrollViewport } from '../../../../testing/scroll-viewport';
import { installViewport } from '../../../../testing/viewport';
import { SCREENER_SCROLL_THROTTLE_MS, SCREENER_SEARCH_DEBOUNCE_MS } from '../state/market.model';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

/** Viewport of the screener list: ten rows of 56 px (`h-14`). */
const ROW_PX = 56;
const VISIBLE_ROWS = 10;

describe('WatchlistPage', () => {
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

  async function open(path: string): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/markets${path}`);
    await run(300);
    await run(300);
    ({ instruments } = await firstValueFrom(TestBed.inject(EngineService).instruments()));
  }

  async function openTab(tab: 'screener' | 'watchlist'): Promise<void> {
    await act(() => click(byTestId(page, `market.nav.${tab}`)));
    await run(300);
    await wait(SCREENER_SCROLL_THROTTLE_MS + 50);
  }

  function all(testId: string, root: ParentNode = page): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)];
  }

  function screenerIds(): string[] {
    return all('market.screener.row').map((row) => row.getAttribute('data-instrument-id') ?? '');
  }

  function screenerRow(id: string): HTMLElement {
    const row = all('market.screener.row').find(
      (element) => element.getAttribute('data-instrument-id') === id,
    );
    if (row === undefined) {
      throw new Error(`No screener row ${id}`);
    }
    return row;
  }

  function watchlistIds(): string[] {
    return all('market.watchlist.row').map((row) => row.getAttribute('data-instrument-id') ?? '');
  }

  function watchlistRow(id: string): HTMLElement {
    const row = all('market.watchlist.row').find(
      (element) => element.getAttribute('data-instrument-id') === id,
    );
    if (row === undefined) {
      throw new Error(`No watchlist row ${id}`);
    }
    return row;
  }

  function instrument(id: string): Instrument {
    const found = instruments.find((other) => other.id === id);
    if (found === undefined) {
      throw new Error(`No instrument ${id}`);
    }
    return found;
  }

  it('searches, combines filters, sorts and changes the watchlist (AP 4.4 acceptance)', async () => {
    await open('/watchlist');
    expect(harness.routeNativeElement?.ownerDocument.title).toContain('Watchlist');
    expect(byTestId(page, 'market.watchlist.empty')).toBeTruthy();
    expect(byTestId(page, 'market.watchlist.open-screener').getAttribute('href')).toBe(
      `/game/${playerId}/markets/screener`,
    );

    await openTab('screener');
    // Shares of Europe, sorted by the performance of one year (best first).
    for (const [dimension, value] of [
      ['assetClasses', 'stock'],
      ['regions', 'europe'],
    ]) {
      byTestId<HTMLDetailsElement>(page, `market.screener.filter.${dimension}`).open = true;
      await settle(harness.fixture);
      await act(() => click(byTestId(page, `market.screener.filter.${dimension}.${value}`)));
    }
    await act(() => click(byTestId(page, 'market.screener.sort.y1')));
    await wait(SCREENER_SCROLL_THROTTLE_MS + 50);
    const [best, second] = screenerIds();
    expect(instrument(best).kind).toBe('stock');
    expect(instrument(best).regionId).toBe('europe');
    const performance = (id: string): number =>
      parseGermanNumber(textOf(byTestId(screenerRow(id), 'market.screener.row.performance')));
    expect(performance(best)).toBeGreaterThanOrEqual(performance(second));

    await act(() => click(byTestId(screenerRow(best), 'market.screener.row.watchlist')));
    await act(() => click(byTestId(screenerRow(second), 'market.screener.row.watchlist')));
    expect(
      byTestId(screenerRow(best), 'market.screener.row.watchlist').getAttribute('aria-pressed'),
    ).toBe('true');

    // A search by ticker among all series finds an ETF; it goes to the end of the list.
    const etf = instruments.find((other) => other.kind === 'etf');
    if (etf === undefined) {
      throw new Error('The world has no ETF');
    }
    await act(() => click(byTestId(page, 'market.screener.filter.reset')));
    typeText(byTestId<HTMLInputElement>(page, 'market.screener.filter.search'), etf.ticker);
    await wait(SCREENER_SEARCH_DEBOUNCE_MS + 50);
    await wait(SCREENER_SCROLL_THROTTLE_MS + 50);
    const star = byTestId(screenerRow(etf.id), 'market.screener.row.watchlist');
    expect(star.getAttribute('aria-pressed')).toBe('false');
    await act(() => click(star));

    await openTab('watchlist');
    expect(watchlistIds()).toEqual([best, second, etf.id]);
    expect(textOf(byTestId(watchlistRow(etf.id), 'market.watchlist.row.ticker'))).toBe(etf.ticker);
    expect(byTestId(watchlistRow(best), 'market.watchlist.row.name').getAttribute('href')).toBe(
      `/game/${playerId}/markets/${best}`,
    );
    // The sparkline of one month comes with the screener figures.
    expect(queryByTestId(watchlistRow(best), 'market.watchlist.row.sparkline')).not.toBeNull();

    // Keyboard alternative: the ETF one place up; the focus stays on its button.
    await act(() => click(byTestId(watchlistRow(etf.id), 'market.watchlist.row.up')));
    expect(watchlistIds()).toEqual([best, etf.id, second]);
    expect(document.activeElement).toBe(byTestId(watchlistRow(etf.id), 'market.watchlist.row.up'));
    // The first row can't move further up.
    const top = byTestId(watchlistRow(best), 'market.watchlist.row.up');
    expect(top.getAttribute('aria-disabled')).toBe('true');
    await act(() => click(top));
    expect(watchlistIds()).toEqual([best, etf.id, second]);
    await act(() => click(byTestId(watchlistRow(best), 'market.watchlist.row.down')));
    expect(watchlistIds()).toEqual([etf.id, best, second]);

    await act(() => click(byTestId(watchlistRow(best), 'market.watchlist.row.remove')));
    expect(watchlistIds()).toEqual([etf.id, second]);

    // The engine keeps the list: another tab and back show the same order.
    await openTab('screener');
    await openTab('watchlist');
    expect(watchlistIds()).toEqual([etf.id, second]);
  });

  it('adds from the instrument page and shows live prices once the exchange trades', async () => {
    // The clock controls with the jump button need a wide header; the instrument page draws a chart.
    onTestFinished(installViewport(1024));
    onTestFinished(installChartPlatform());
    await open('');
    const stock = instruments.find(
      (other) => other.kind === 'stock' && other.regionId === 'europe',
    );
    if (stock === undefined) {
      throw new Error('The world has no European share');
    }
    await harness.navigateByUrl(`/game/${playerId}/markets/${stock.id}`);
    await run(300);
    const star = byTestId(page, 'market.instrument.watchlist');
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(star.getAttribute('aria-label')).toBe(`Auf der Watchlist: ${stock.name}`);
    await act(() => click(star));
    expect(byTestId(page, 'market.instrument.watchlist').getAttribute('aria-pressed')).toBe('true');

    await harness.navigateByUrl(`/game/${playerId}/markets/watchlist`);
    await run(300);
    await run(300);
    expect(watchlistIds()).toEqual([stock.id]);
    const price = (): string =>
      textOf(byTestId(watchlistRow(stock.id), 'market.watchlist.row.price'));
    const before = price();

    // Jump to Mon 01.04.2030 10:00, when Europe trades, and let the game run.
    await act(() => click(byTestId(page, 'shell.header.jump-button')));
    await act(() => click(byTestId(document.body, 'clock.jump-dialog.date-kind')));
    await act(() =>
      typeText(byTestId<HTMLInputElement>(document.body, 'clock.jump-dialog.date'), '2030-04-01'),
    );
    await act(() =>
      typeText(byTestId<HTMLInputElement>(document.body, 'clock.jump-dialog.time'), '10:00'),
    );
    await act(() => click(byTestId(document.body, 'clock.jump-dialog.submit')));
    await run(500);

    // The quotes of the engine while the game runs; the last one is the price after the pause.
    let latest: SeriesQuote | undefined;
    const subscription: Subscription = TestBed.inject(EngineService)
      .quotes([stock.series])
      .subscribe((quotes) => (latest = quotes.at(-1) ?? latest));
    onTestFinished(() => subscription.unsubscribe());
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(3_000);
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(500);

    expect(price()).not.toBe(before);
    expect(latest).toBeDefined();
    expect(Math.abs(parseEuros(price()) - (latest?.last ?? Number.NaN))).toBeLessThan(0.01);
  });

  it('blocks adding to a full watchlist and says why', async () => {
    await open('/screener');
    await wait(SCREENER_SCROLL_THROTTLE_MS + 50);
    // Fill the list with the last series, so the first rows of the screener stay off it.
    const full = instruments.slice(-MAX_WATCHLIST_LENGTH).map(({ id }) => id);
    await firstValueFrom(TestBed.inject(EngineService).updateWatchlist(full));
    await run(300);

    const offList = screenerIds().find((id) => !full.includes(id));
    if (offList === undefined) {
      throw new Error('Every visible row is on the list');
    }
    const star = byTestId(screenerRow(offList), 'market.screener.row.watchlist');
    expect(star.getAttribute('aria-disabled')).toBe('true');
    expect(star.getAttribute('aria-label')).toContain('die Watchlist ist voll (höchstens 50');
    await act(() => click(star));
    expect(star.getAttribute('aria-pressed')).toBe('false');

    await openTab('watchlist');
    expect(watchlistIds()).toEqual(full);
  });
});
