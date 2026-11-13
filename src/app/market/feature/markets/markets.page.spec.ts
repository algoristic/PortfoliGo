import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Subscription } from 'rxjs';

import { SubscriptionPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { byTestId, click, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseGermanNumber } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
// Series order (TS §8.2): shares, then the price indices in world order. The overview shows the
// price indices except the sector indices, whose quotes come with the movers.
const PRICE_INDICES = WORLD.indices.map((index, position) => ({
  index,
  series: WORLD.companies.length + position,
}));
const OVERVIEW = PRICE_INDICES.filter(({ index }) => index.kind !== 'sector');
const OVERVIEW_SERIES = OVERVIEW.map(({ series }) => series);
const SECTORS = PRICE_INDICES.filter(({ index }) => index.kind === 'sector');

const MINUTE_MS = 60_000;

/** Tick of a game time (UTC): game minutes since 01.01.2020 (TS §4.2). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(2020, 0, 1)) / MINUTE_MS;
}

// TS §11.3, table "Stufen der Sektor-Heatmap": bounds 0.05 %, 0.5 %, 1 % and 2 %.
function expectedLevel(changeRatio: number): number {
  const size = Math.abs(changeRatio);
  const level = [0.0005, 0.005, 0.01, 0.02].filter((bound) => size >= bound).length;
  return level === 0 ? 0 : Math.sign(changeRatio) * level;
}

describe('MarketsPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;

  beforeEach(async () => {
    localStorage.clear();
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

  async function openOverview(): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/markets`);
    await run(200);
    await run(300);
  }

  function subscriptions(type: 'subscribe' | 'unsubscribe'): SubscriptionPayload[] {
    return (engine.current?.received ?? [])
      .filter((message) => message.type === type)
      .map((message) => message.payload as SubscriptionPayload);
  }

  function rows(testId: string): HTMLElement[] {
    return [...page.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)];
  }

  /** The newest quotes of `series` through the public engine API. */
  async function quotesOf(series: number[]): Promise<Map<number, SeriesQuote>> {
    const latest = new Map<number, SeriesQuote>();
    const subscription: Subscription = TestBed.inject(EngineService)
      .quotes(series)
      .subscribe((quotes) => quotes.forEach((quote) => latest.set(quote.series, quote)));
    await run(300);
    subscription.unsubscribe();
    return latest;
  }

  it('subscribes the movers, the overview indices and their charts and ends them when left', async () => {
    await openOverview();
    expect(subscriptions('subscribe')).toContainEqual({ series: [], movers: true });
    expect(subscriptions('subscribe')).toContainEqual({ series: OVERVIEW_SERIES });
    const charts = subscriptions('subscribe').flatMap((payload) => payload.charts ?? []);
    expect(charts).toEqual(
      expect.arrayContaining(OVERVIEW_SERIES.map((series) => ({ series, interval: '15m' }))),
    );

    await harness.navigateByUrl(`/game/${playerId}/banks`);
    await run(200);
    expect(subscriptions('unsubscribe')).toContainEqual({ series: [], movers: true });
    expect(subscriptions('unsubscribe')).toContainEqual({ series: OVERVIEW_SERIES });
    const ended = subscriptions('unsubscribe').flatMap((payload) => payload.charts ?? []);
    expect(ended).toEqual(
      expect.arrayContaining(OVERVIEW_SERIES.map((series) => ({ series, interval: '15m' }))),
    );
  });

  it('shows the indices with the line of the last trading day before the open', async () => {
    // The quotes before the page subscribes them (a second subscriber gets no package of its own).
    await harness.navigateByUrl(`/game/${playerId}/banks`);
    await run(300);
    const quotes = await quotesOf(OVERVIEW_SERIES);
    await openOverview();
    const cards = rows('market.overview.index');
    expect(cards.map((card) => textOf(byTestId(card, 'market.overview.index.name')))).toEqual(
      OVERVIEW.map(({ index }) => index.name),
    );

    // The game starts on Mon 01.04.2030 at 00:00: the lines show Friday 29.03.2030.
    const engineService = TestBed.inject(EngineService);
    for (const [position, { series }] of OVERVIEW.entries()) {
      const { candles } = await firstValueFrom(
        engineService.candles({
          series,
          interval: '15m',
          from: tick(2030, 3, 29),
          to: tick(2030, 3, 29, 23, 59),
        }),
      );
      expect(candles.length).toBeGreaterThan(0);
      const card = cards[position];
      // The open of the day and one close per candle.
      expect(byTestId(card, 'market.overview.index.sparkline').getAttribute('data-points')).toBe(
        String(candles.length + 1),
      );
      const quote = quotes.get(series);
      expect(quote).toBeDefined();
      expect(parseGermanNumber(textOf(byTestId(card, 'market.overview.index.level')))).toBeCloseTo(
        quote?.last ?? Number.NaN,
        2,
      );
    }
  });

  it('shows gainers, losers and the sector heat map of the day', async () => {
    await openOverview();
    const stocks = WORLD.companies.map((_company, series) => series);
    const quotes = [...(await quotesOf(stocks)).values()];
    const byChange = [...quotes].sort((a, b) => b.changeRatio - a.changeRatio);
    const names = new Map(WORLD.companies.map((company, series) => [series, company.name]));

    const gainers = rows('market.overview.gainers.row');
    const losers = rows('market.overview.losers.row');
    expect(gainers.map((row) => textOf(byTestId(row, 'market.overview.gainers.name')))).toEqual(
      byChange
        .filter((quote) => quote.changeRatio > 0)
        .slice(0, 5)
        .map((quote) => names.get(quote.series)),
    );
    expect(losers.map((row) => textOf(byTestId(row, 'market.overview.losers.name')))).toEqual(
      byChange
        .filter((quote) => quote.changeRatio < 0)
        .reverse()
        .slice(0, 5)
        .map((quote) => names.get(quote.series)),
    );

    const sectorQuotes = await quotesOf(SECTORS.map(({ series }) => series));
    const tiles = rows('market.overview.sector');
    expect(tiles.map((tile) => tile.getAttribute('data-sector-id'))).toEqual(
      SECTORS.map(({ index }) => index.sectorId),
    );
    for (const [position, { series, index }] of SECTORS.entries()) {
      const changeRatio = sectorQuotes.get(series)?.changeRatio ?? Number.NaN;
      expect(tiles[position].getAttribute('data-level')).toBe(String(expectedLevel(changeRatio)));
      expect(tiles[position].getAttribute('href')).toBe(`/game/${playerId}/markets/${index.id}`);
    }
  });

  it('notes the closed exchanges at night and moves the prices once they trade', async () => {
    // The clock controls with the jump button need a wide header.
    const restoreViewport = installViewport(1024);
    onTestFinished(restoreViewport);
    await openOverview();
    // Mon 01.04.2030, 00:00: no exchange trades yet (TS §3.3).
    expect(textOf(byTestId(page, 'market.overview.closed'))).toContain('Börse geschlossen');
    expect(
      rows('market.overview.region').every((row) => row.getAttribute('data-open') === 'false'),
    ).toBe(true);

    // Jump to 10:00, when Europe trades, and let the game run.
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
    expect(page.querySelector('[data-testid="market.overview.closed"]')).toBeNull();
    const europe = page.querySelector(
      '[data-testid="market.overview.region"][data-region-id="europe"]',
    );
    expect(europe?.getAttribute('data-open')).toBe('true');

    const levels = (): string[] =>
      rows('market.overview.index.level').map((element) => textOf(element));
    const before = levels();
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(3_000);
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(500);
    expect(levels()).not.toEqual(before);

    // The lines show the newest day with candles up to now: Monday, or Friday for an index whose
    // session has not begun yet; the counts come from the engine's candles.
    const engineService = TestBed.inject(EngineService);
    const cards = rows('market.overview.index');
    let monday = 0;
    for (const [position, { series }] of OVERVIEW.entries()) {
      const today = await firstValueFrom(
        engineService.candles({ series, interval: '15m', from: tick(2030, 4, 1) }),
      );
      const friday = await firstValueFrom(
        engineService.candles({
          series,
          interval: '15m',
          from: tick(2030, 3, 29),
          to: tick(2030, 3, 29, 23, 59),
        }),
      );
      const shown = today.candles.length > 0 ? today.candles : friday.candles;
      monday += today.candles.length > 0 ? 1 : 0;
      expect(
        byTestId(cards[position], 'market.overview.index.sparkline').getAttribute('data-points'),
      ).toBe(String(shown.length + 1));
    }
    // Europe trades, so its indices have Monday candles.
    expect(monday).toBeGreaterThan(0);
  });
});
