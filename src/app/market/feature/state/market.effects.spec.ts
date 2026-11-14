import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, Subscription, take, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { selectTick } from '@app/clock/feature/state/clock.selectors';
import { ENGINE_WORKER_FACTORY } from '@app/engine/data-access/service/engine-service.config';
import {
  ENGINE_PROTOCOL,
  EngineCommandMessage,
  EngineEventPayloads,
  EngineWorkerPort,
  MoversPayload,
  SubscriptionPayload,
} from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase } from '@app/engine/feature/state/session.selectors';
import { Candle } from '@app/market/domain/models/candle.model';
import { InstrumentFigures } from '@app/market/domain/models/instrument-figures.model';
import { Instrument, InstrumentDetails } from '@app/market/domain/models/instrument.model';
import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as MarketActions from './market.actions';
import { MarketEffects } from './market.effects';
import {
  ChartSettings,
  ChartSubscription,
  INSTRUMENT_PAGE_SUBSCRIPTION,
  InstrumentChartState,
  MARKETS_PAGE_SUBSCRIPTION,
  QUOTES_BUNDLE_WINDOW_MS,
  QuoteSubscriptions,
  SCREENER_SEARCH_DEBOUNCE_MS,
  SCREENER_SUBSCRIPTION,
  WATCHLIST_SUBSCRIPTION,
} from './market.model';
import {
  initialChartState,
  initialInstrumentDetailState,
  initialScreenerState,
} from './market.reducer';
import {
  selectChart,
  selectChartSettings,
  selectChartSubscription,
  selectInstrumentDetail,
  selectInstrumentsLoaded,
  selectMarketDay,
  selectMoversWanted,
  selectOverviewIndexSeries,
  selectOverviewSparklines,
  selectQuoteSubscriptions,
  selectRouteInstrument,
  selectRouteInstrumentId,
  selectRouteInstrumentSession,
  selectScreener,
  selectScreenerCriteria,
  selectScreenerWindowSeries,
  selectWatchlistIds,
  selectWatchlistKnown,
  selectWatchlistRowsMissing,
  selectWatchlistSeries,
} from './market.selectors';

/** The worker boundary: records the commands and lets the test send events. */
class FakeWorker implements EngineWorkerPort {
  readonly received: EngineCommandMessage[] = [];
  readonly #listeners: Array<(event: MessageEvent<unknown>) => void> = [];
  #nextId = 1;

  postMessage(message: EngineCommandMessage): void {
    this.received.push(message);
  }

  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: ((event: MessageEvent<unknown>) => void) | ((event: Event) => void),
  ): void {
    if (type === 'message') {
      this.#listeners.push(listener as (event: MessageEvent<unknown>) => void);
    }
  }

  terminate(): void {
    // Nothing runs.
  }

  emit<K extends 'quotes' | 'movers' | 'candle'>(type: K, payload: EngineEventPayloads[K]): void {
    const data = { protocol: ENGINE_PROTOCOL, id: `w${this.#nextId++}`, type, payload };
    this.#listeners.forEach((listener) => listener(new MessageEvent('message', { data })));
  }

  /** The `subscribe` and `unsubscribe` commands in order. */
  subscriptions(): Array<{ type: string; payload: SubscriptionPayload }> {
    return this.received
      .filter((message) => message.type === 'subscribe' || message.type === 'unsubscribe')
      .map((message) => ({ type: message.type, payload: message.payload as SubscriptionPayload }));
  }
}

function quote(series: number, last: number): SeriesQuote {
  return {
    series,
    last,
    bid: null,
    ask: null,
    previousClose: 100,
    change: last - 100,
    changeRatio: (last - 100) / 100,
  };
}

const PROFILE = { id: 'p-a' } as PlayerProfile;
const ENTER = SessionActions.enterGame({ profile: PROFILE });
const LOADED = SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 0 } });
const STOCK = { id: 'cmp-0001', series: 7, kind: 'stock' } as Instrument;

const MINUTE_MS = 60_000;

/** Tick of a game time (UTC): game minutes since 01.01.2020 (TS §4.2). */
function tickAt(year: number, month: number, day: number, minute = 0): number {
  return (Date.UTC(year, month - 1, day) - Date.UTC(2020, 0, 1)) / MINUTE_MS + minute;
}

function candle(tick: number, close = 10): Candle {
  return { tick, open: 10, high: 11, low: 9, close };
}

/** Mon 01.04.2030, 08:00, before the open. */
const NOW = tickAt(2030, 4, 1, 480);
const FRIDAY = tickAt(2030, 3, 29, 540);

const CHART_SETTINGS: ChartSettings = {
  range: '6m',
  chartType: 'line',
  indicators: [
    { id: 'i1', spec: { kind: 'sma', period: 50 }, color: 'chart-1' },
    { id: 'i2', spec: { kind: 'bollinger', period: 20, multiplier: 2.5 }, color: 'chart-2' },
  ],
};

describe('MarketEffects', () => {
  let effects: MarketEffects;
  let actions$: Subject<Action>;
  let worker: FakeWorker;
  let engine: EngineService;
  let toasts: Mocked<Pick<ToastService, 'error'>>;
  let store: MockStore;
  let subscription: Subscription | undefined;

  beforeEach(() => {
    actions$ = new Subject();
    worker = new FakeWorker();
    toasts = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MarketEffects,
        EngineService,
        LocalStorageService,
        provideMockActions(() => actions$.asObservable()),
        { provide: ENGINE_WORKER_FACTORY, useValue: () => worker },
        { provide: ToastService, useValue: toasts },
        provideMockStore({
          selectors: [
            { selector: selectQuoteSubscriptions, value: {} },
            { selector: selectMoversWanted, value: false },
            { selector: selectInstrumentsLoaded, value: false },
            { selector: selectOverviewIndexSeries, value: [] },
            { selector: selectRouteInstrument, value: null },
            { selector: selectRouteInstrumentId, value: undefined },
            { selector: selectRouteInstrumentSession, value: null },
            { selector: selectInstrumentDetail, value: initialInstrumentDetailState },
            { selector: selectTick, value: null },
            { selector: selectChart, value: initialChartState },
            { selector: selectChartSubscription, value: { interval: '1m', live: true } },
            { selector: selectChartSettings, value: CHART_SETTINGS },
            { selector: selectPhase, value: 'loading' },
            { selector: selectScreener, value: initialScreenerState },
            {
              selector: selectScreenerCriteria,
              value: { sort: { key: 'name', direction: 'asc' } },
            },
            { selector: selectScreenerWindowSeries, value: [] },
            { selector: selectMarketDay, value: 3_744 },
            { selector: selectOverviewSparklines, value: {} },
            { selector: selectWatchlistIds, value: [] },
            { selector: selectWatchlistKnown, value: false },
            { selector: selectWatchlistSeries, value: [] },
            { selector: selectWatchlistRowsMissing, value: false },
          ],
        }),
      ],
    });
    effects = TestBed.inject(MarketEffects);
    engine = TestBed.inject(EngineService);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
    localStorage.clear();
    subscription?.unsubscribe();
    subscription = undefined;
    vi.useRealTimers();
  });

  function setChart(chart: Partial<InstrumentChartState>): void {
    store.overrideSelector(selectChart, { ...initialChartState, ...chart });
    store.refreshState();
  }

  function setChartSubscription(chartSubscription: ChartSubscription): void {
    store.overrideSelector(selectChartSubscription, chartSubscription);
    store.refreshState();
  }

  function setSubscriptions(subscriptions: QuoteSubscriptions): void {
    store.overrideSelector(selectQuoteSubscriptions, subscriptions);
    store.refreshState();
  }

  describe('loadInstruments$', () => {
    it('loads the master data after the player was loaded', async () => {
      const instruments = vi
        .spyOn(engine, 'instruments')
        .mockReturnValue(of({ kind: 'instruments' as const, instruments: [STOCK] }));
      const result = firstValueFrom(effects.loadInstruments$);
      actions$.next(ENTER);
      expect(instruments).not.toHaveBeenCalled();
      actions$.next(LOADED);
      expect(await result).toEqual(MarketActions.retrievedInstruments({ instruments: [STOCK] }));
    });

    it('dispatches loadInstrumentsFailure when the query fails', async () => {
      const error = new EngineCommandError('worker-failed');
      vi.spyOn(engine, 'instruments').mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadInstruments$);
      actions$.next(LOADED);
      expect(await result).toEqual(MarketActions.loadInstrumentsFailure({ error }));
    });
  });

  describe('showFailure$', () => {
    it('shows a toast when the master data could not be loaded', () => {
      subscription = effects.showFailure$.subscribe();
      actions$.next(MarketActions.loadInstrumentsFailure({ error: new Error('x') }));
      expect(toasts.error).toHaveBeenCalledWith('Die Wertpapiere konnten nicht geladen werden.');
    });
  });

  describe('watchQuotes$', () => {
    it('subscribes nothing before the reply to loadPlayer of the entered player', () => {
      setSubscriptions({ a: [1, 2] });
      subscription = effects.watchQuotes$.subscribe();
      actions$.next(ENTER);
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-b', tick: 0 } }));
      expect(worker.subscriptions()).toEqual([]);
    });

    it('replaces the subscription of a key and ends it with the key', () => {
      subscription = effects.watchQuotes$.subscribe();
      actions$.next(ENTER);
      actions$.next(LOADED);
      setSubscriptions({ a: [1, 2] });
      setSubscriptions({ a: [2, 3] });
      setSubscriptions({});
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [1, 2] } },
        // The new set first, so series 2 stays subscribed in the worker.
        { type: 'subscribe', payload: { series: [3] } },
        { type: 'unsubscribe', payload: { series: [1] } },
        { type: 'unsubscribe', payload: { series: [2, 3] } },
      ]);
    });

    it('keeps one worker subscription per series for keys that overlap', () => {
      subscription = effects.watchQuotes$.subscribe();
      actions$.next(ENTER);
      actions$.next(LOADED);
      setSubscriptions({ a: [1, 2] });
      const b = [2, 3];
      setSubscriptions({ a: [1, 2], b });
      // Removing `a` must leave series 2 to `b`.
      setSubscriptions({ b });
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [1, 2] } },
        { type: 'subscribe', payload: { series: [3] } },
        { type: 'unsubscribe', payload: { series: [1] } },
      ]);
    });

    it('keeps the subscription of a key whose set did not change', () => {
      subscription = effects.watchQuotes$.subscribe();
      actions$.next(ENTER);
      actions$.next(LOADED);
      const a = [1, 2];
      setSubscriptions({ a });
      setSubscriptions({ a, b: [5] });
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [1, 2] } },
        { type: 'subscribe', payload: { series: [5] } },
      ]);
    });

    it('ends every subscription when the game is left', () => {
      subscription = effects.watchQuotes$.subscribe();
      actions$.next(ENTER);
      actions$.next(LOADED);
      setSubscriptions({ a: [1], b: [1, 4] });
      actions$.next(SessionActions.leaveGame());
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [1] } },
        { type: 'subscribe', payload: { series: [4] } },
        // Series 1 leaves the worker with the last key that watched it.
        { type: 'unsubscribe', payload: { series: [1, 4] } },
      ]);
    });

    it('bundles the quotes of all keys within the window into one action', () => {
      vi.useFakeTimers();
      const received: Action[] = [];
      subscription = effects.watchQuotes$.subscribe((action) => received.push(action));
      actions$.next(ENTER);
      actions$.next(LOADED);
      setSubscriptions({ a: [1], b: [2] });

      worker.emit('quotes', { tick: 10, quotes: [quote(1, 101), quote(2, 99)] });
      vi.advanceTimersByTime(QUOTES_BUNDLE_WINDOW_MS - 1);
      worker.emit('quotes', { tick: 11, quotes: [quote(1, 102)] });
      expect(received).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(received).toEqual([
        MarketActions.receivedQuotes({ quotes: [quote(1, 102), quote(2, 99)] }),
      ]);

      worker.emit('quotes', { tick: 12, quotes: [quote(2, 98)] });
      vi.advanceTimersByTime(QUOTES_BUNDLE_WINDOW_MS);
      expect(received).toHaveLength(2);
      expect(received[1]).toEqual(MarketActions.receivedQuotes({ quotes: [quote(2, 98)] }));
    });
  });

  describe('watchMovers$', () => {
    const movers: MoversPayload = {
      tick: 10,
      gainers: [quote(1, 110)],
      losers: [quote(2, 90)],
      sectors: [],
    };

    it('subscribes the movers while a view wants them', () => {
      const received: Action[] = [];
      subscription = effects.watchMovers$.subscribe((action) => received.push(action));
      actions$.next(ENTER);
      actions$.next(LOADED);
      store.overrideSelector(selectMoversWanted, true);
      store.refreshState();
      worker.emit('movers', movers);
      store.overrideSelector(selectMoversWanted, false);
      store.refreshState();
      expect(received).toEqual([MarketActions.receivedMovers({ movers })]);
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [], movers: true } },
        { type: 'unsubscribe', payload: { series: [], movers: true } },
      ]);
    });
  });

  describe('enterMarketsPage$', () => {
    it('watches the movers at once and the overview indices once the master data is there', () => {
      const received: Action[] = [];
      subscription = effects.enterMarketsPage$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterMarketsPage());
      expect(received).toEqual([
        MarketActions.moversSubscriptionStarted({ key: MARKETS_PAGE_SUBSCRIPTION }),
      ]);
      store.overrideSelector(selectOverviewIndexSeries, [20, 21]);
      store.overrideSelector(selectInstrumentsLoaded, true);
      store.refreshState();
      expect(received[1]).toEqual(
        MarketActions.quotesSubscriptionChanged({
          key: MARKETS_PAGE_SUBSCRIPTION,
          series: [20, 21],
        }),
      );
    });

    it('subscribes no indices when the page was left before the master data arrived', () => {
      const received: Action[] = [];
      subscription = effects.enterMarketsPage$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterMarketsPage());
      actions$.next(MarketActions.leaveMarketsPage());
      store.overrideSelector(selectInstrumentsLoaded, true);
      store.refreshState();
      expect(received).toHaveLength(1);
    });
  });

  describe('enterInstrumentPage$', () => {
    it('watches the quote of the route instrument once it is known', () => {
      const received: Action[] = [];
      subscription = effects.enterInstrumentPage$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterInstrumentPage());
      expect(received).toEqual([]);
      store.overrideSelector(selectRouteInstrument, STOCK);
      store.refreshState();
      expect(received).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: INSTRUMENT_PAGE_SUBSCRIPTION, series: [7] }),
      ]);
    });
  });

  describe('loadChart$', () => {
    function answer(candles: Candle[], hasOlder = false): ReturnType<EngineService['candles']> {
      return of({
        kind: 'candles' as const,
        series: 7,
        interval: '1m' as const,
        candles,
        hasOlder,
        tick: NOW,
      });
    }

    it('loads the start block once instrument and clock are known', async () => {
      // Live 1T before Monday's open: the block reaches back to Friday, the chart keeps the newest
      // day with candles.
      const thursday = candle(tickAt(2030, 3, 28, 540));
      const friday = [candle(FRIDAY), candle(FRIDAY + 1)];
      const candles = vi.spyOn(engine, 'candles').mockReturnValue(answer([thursday, ...friday]));
      setChart({ generation: 3, loading: true });
      const result = firstValueFrom(effects.loadChart$);
      actions$.next(MarketActions.enterInstrumentPage());
      expect(candles).not.toHaveBeenCalled();
      store.overrideSelector(selectRouteInstrument, STOCK);
      store.overrideSelector(selectTick, NOW);
      store.refreshState();
      expect(candles).toHaveBeenCalledWith({
        series: 7,
        interval: '1m',
        from: tickAt(2030, 3, 29),
        limit: 2_000,
      });
      expect(await result).toEqual(
        MarketActions.retrievedChartCandles({ generation: 3, candles: friday, hasOlder: true }),
      );
    });

    it('dispatches loadChartCandlesFailure with the generation of the query', async () => {
      const error = new EngineCommandError('unknown-instrument');
      vi.spyOn(engine, 'candles').mockReturnValue(throwError(() => error));
      store.overrideSelector(selectRouteInstrument, STOCK);
      store.overrideSelector(selectTick, NOW);
      setChart({ generation: 5, reloading: true, range: '1y' });
      const result = firstValueFrom(effects.loadChart$);
      actions$.next(MarketActions.detectedChartGap({ generation: 4 }));
      expect(await result).toEqual(MarketActions.loadChartCandlesFailure({ generation: 5, error }));
    });

    it('loads nothing while the chart waits for no block', () => {
      const candles = vi.spyOn(engine, 'candles');
      store.overrideSelector(selectRouteInstrument, STOCK);
      store.overrideSelector(selectTick, NOW);
      setChart({ loading: false });
      subscription = effects.loadChart$.subscribe();
      actions$.next(MarketActions.clickedChartRange({ range: '1d' }));
      expect(candles).not.toHaveBeenCalled();
    });
  });

  describe('loadOlderChartCandles$', () => {
    it('loads the block before the oldest candle while the reducer asks for it', async () => {
      const older = [candle(tickAt(2028, 4, 3))];
      const candles = vi.spyOn(engine, 'candles').mockReturnValue(
        of({
          kind: 'candles' as const,
          series: 7,
          interval: '1d' as const,
          candles: older,
          hasOlder: false,
          tick: NOW,
        }),
      );
      store.overrideSelector(selectRouteInstrument, STOCK);
      setChart({
        generation: 2,
        range: '1y',
        candles: [candle(tickAt(2029, 4, 2))],
        hasOlder: true,
        loadingOlder: true,
      });
      const result = firstValueFrom(effects.loadOlderChartCandles$);
      actions$.next(MarketActions.scrolledToChartStart());
      expect(candles).toHaveBeenCalledWith({
        series: 7,
        interval: '1d',
        from: tickAt(2028, 4, 1),
        to: tickAt(2029, 4, 1, 1439),
        limit: 2_000,
      });
      expect(await result).toEqual(
        MarketActions.retrievedOlderChartCandles({
          generation: 2,
          candles: older,
          hasOlder: false,
        }),
      );
    });

    it('loads nothing when the reducer refused the request', () => {
      const candles = vi.spyOn(engine, 'candles');
      store.overrideSelector(selectRouteInstrument, STOCK);
      setChart({ candles: [candle(FRIDAY)], hasOlder: false, loadingOlder: false });
      subscription = effects.loadOlderChartCandles$.subscribe();
      actions$.next(MarketActions.scrolledToChartStart());
      expect(candles).not.toHaveBeenCalled();
    });
  });

  describe('watchChart$', () => {
    const loaded = [candle(FRIDAY), candle(FRIDAY + 1)];
    const chartPayload = (live: { candle: Candle; previous?: Candle }) => ({
      tick: NOW,
      series: 7,
      interval: '1m' as const,
      ...live,
    });

    beforeEach(() => {
      store.overrideSelector(selectRouteInstrument, STOCK);
      setChart({ generation: 2, candles: loaded });
    });

    it('applies live candles and loads the block again after skipped ones', () => {
      const received: Action[] = [];
      subscription = effects.watchChart$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterInstrumentPage());
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [], charts: [{ series: 7, interval: '1m' }] } },
      ]);

      const running = candle(FRIDAY + 1, 12);
      const next = candle(FRIDAY + 2);
      worker.emit('candle', chartPayload({ candle: running }));
      worker.emit('candle', chartPayload({ candle: next, previous: running }));
      worker.emit('candle', chartPayload({ candle: candle(FRIDAY) }));
      worker.emit('candle', chartPayload({ candle: candle(FRIDAY + 5) }));
      expect(received).toEqual([
        MarketActions.receivedLiveCandle({ generation: 2, live: { candle: running } }),
        MarketActions.receivedLiveCandle({
          generation: 2,
          live: { candle: next, previous: running },
        }),
        // An older candle changes nothing; one without its predecessor skipped candles.
        MarketActions.detectedChartGap({ generation: 2 }),
      ]);
    });

    it('drops live candles while a start block loads', () => {
      const received: Action[] = [];
      subscription = effects.watchChart$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterInstrumentPage());
      setChart({ generation: 3, candles: loaded, reloading: true });
      worker.emit('candle', chartPayload({ candle: candle(FRIDAY + 5) }));
      expect(received).toEqual([]);
    });

    it('subscribes only while the block reaches now and ends with the page', () => {
      subscription = effects.watchChart$.subscribe();
      setChartSubscription({ interval: '1m', live: false });
      actions$.next(MarketActions.enterInstrumentPage());
      expect(worker.subscriptions()).toEqual([]);
      setChartSubscription({ interval: '15m', live: true });
      actions$.next(MarketActions.leaveInstrumentPage());
      expect(worker.subscriptions()).toEqual([
        { type: 'subscribe', payload: { series: [], charts: [{ series: 7, interval: '15m' }] } },
        { type: 'unsubscribe', payload: { series: [], charts: [{ series: 7, interval: '15m' }] } },
      ]);
    });
  });

  describe('showChartFailure$', () => {
    it('shows a toast when candles could not be loaded', () => {
      subscription = effects.showChartFailure$.subscribe();
      actions$.next(MarketActions.loadOlderChartCandlesFailure({ generation: 1, error: 'x' }));
      expect(toasts.error).toHaveBeenCalledWith('Der Kursverlauf konnte nicht geladen werden.');
    });
  });

  describe('loadChartSettings$', () => {
    it('reads the stored chart settings when a game is entered', async () => {
      localStorage.setItem('pgo.ui.chart', JSON.stringify({ v: 1, data: CHART_SETTINGS }));
      const result = firstValueFrom(effects.loadChartSettings$);
      actions$.next(ENTER);
      expect(await result).toEqual(MarketActions.loadedChartSettings({ settings: CHART_SETTINGS }));
    });

    it.each([
      ['broken JSON', '{"v":1,'],
      ['another version', JSON.stringify({ v: 2, data: CHART_SETTINGS })],
      ['an invalid value', JSON.stringify({ v: 1, data: { range: 'x', indicators: [{}] } })],
    ])('gives the defaults for %s', async (_name, raw) => {
      localStorage.setItem('pgo.ui.chart', raw);
      const result = firstValueFrom(effects.loadChartSettings$);
      actions$.next(ENTER);
      expect(await result).toEqual(
        MarketActions.loadedChartSettings({
          settings: { range: '1d', chartType: 'candles', indicators: [] },
        }),
      );
    });
  });

  describe('saveChartSettings$', () => {
    it('stores the chart settings of the store after a change', () => {
      subscription = effects.saveChartSettings$.subscribe();
      actions$.next(MarketActions.clickedRemoveChartIndicator({ id: 'i3' }));
      expect(JSON.parse(localStorage.getItem('pgo.ui.chart') ?? 'null')).toEqual({
        v: 1,
        data: CHART_SETTINGS,
      });
    });

    it('dispatches saveChartSettingsFailure and shows a toast when saving fails', async () => {
      const error = new DOMException('full', 'QuotaExceededError');
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw error;
      });
      onTestFinished(() => {
        vi.restoreAllMocks();
      });
      const result = firstValueFrom(effects.saveChartSettings$);
      actions$.next(MarketActions.clickedChartType({ chartType: 'line' }));
      const failure = await result;
      expect(failure).toEqual(MarketActions.saveChartSettingsFailure({ error }));

      subscription = effects.showChartSettingsFailure$.subscribe();
      actions$.next(failure);
      expect(toasts.error).toHaveBeenCalledWith(
        'Die Chart-Einstellungen gelten nur bis zum Neuladen, weil sie auf diesem Gerät nicht gespeichert werden konnten.',
      );
    });
  });

  describe('loadScreener$', () => {
    const RESULT = { total: 0, rows: [], tick: NOW };

    function setScreener(generation: number): void {
      store.overrideSelector(selectScreener, { ...initialScreenerState, generation });
      store.refreshState();
    }

    function loaded(): void {
      store.overrideSelector(selectPhase, 'loaded');
      store.refreshState();
    }

    it('queries once the player is loaded, at once after a filter and debounced after typing', () => {
      vi.useFakeTimers();
      const screener = vi
        .spyOn(engine, 'screener')
        .mockReturnValue(of({ kind: 'screener' as const, ...RESULT }));
      const received: Action[] = [];
      subscription = effects.loadScreener$.subscribe((action) => received.push(action));
      setScreener(4);
      actions$.next(MarketActions.enterScreenerPage());
      expect(screener).not.toHaveBeenCalled();
      loaded();
      expect(received).toEqual([
        MarketActions.retrievedScreener({ generation: 4, result: RESULT }),
      ]);

      setScreener(5);
      actions$.next(MarketActions.clickedScreenerSort({ key: 'y1' }));
      expect(received.at(-1)).toEqual(
        MarketActions.retrievedScreener({ generation: 5, result: RESULT }),
      );
      expect(screener).toHaveBeenCalledTimes(2);

      actions$.next(MarketActions.enteredScreenerSearch({ search: 'a' }));
      vi.advanceTimersByTime(SCREENER_SEARCH_DEBOUNCE_MS - 1);
      actions$.next(MarketActions.enteredScreenerSearch({ search: 'ab' }));
      vi.advanceTimersByTime(SCREENER_SEARCH_DEBOUNCE_MS - 1);
      expect(screener).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(screener).toHaveBeenCalledTimes(3);
    });

    it('queries again when a new market day begins and stops when the page is left', () => {
      const screener = vi
        .spyOn(engine, 'screener')
        .mockReturnValue(of({ kind: 'screener' as const, ...RESULT }));
      subscription = effects.loadScreener$.subscribe();
      actions$.next(MarketActions.enterScreenerPage());
      loaded();
      store.overrideSelector(selectMarketDay, 3_744);
      store.refreshState();
      expect(screener).toHaveBeenCalledTimes(1);
      store.overrideSelector(selectMarketDay, 3_745);
      store.refreshState();
      expect(screener).toHaveBeenCalledTimes(2);

      actions$.next(MarketActions.leaveScreenerPage());
      store.overrideSelector(selectMarketDay, 3_746);
      store.refreshState();
      actions$.next(MarketActions.clickedResetScreenerFilter());
      expect(screener).toHaveBeenCalledTimes(2);
    });

    it('dispatches loadScreenerFailure for the generation of a failed query', async () => {
      const error = new EngineCommandError('invalid-command');
      vi.spyOn(engine, 'screener').mockReturnValue(throwError(() => error));
      setScreener(7);
      const result = firstValueFrom(effects.loadScreener$);
      actions$.next(MarketActions.enterScreenerPage());
      loaded();
      expect(await result).toEqual(MarketActions.loadScreenerFailure({ generation: 7, error }));
    });
  });

  describe('watchScreenerQuotes$', () => {
    it('watches the window of the rendered rows from the first result on', () => {
      vi.useFakeTimers();
      const received: Action[] = [];
      subscription = effects.watchScreenerQuotes$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterScreenerPage());
      expect(received).toEqual([]);

      store.overrideSelector(selectScreenerWindowSeries, [1, 2, 3]);
      store.refreshState();
      expect(received).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: SCREENER_SUBSCRIPTION, series: [1, 2, 3] }),
      ]);

      // Scrolling within the throttle: only the newest window follows at its end.
      store.overrideSelector(selectScreenerWindowSeries, [2, 3, 4]);
      store.refreshState();
      store.overrideSelector(selectScreenerWindowSeries, [3, 4, 5]);
      store.refreshState();
      expect(received).toHaveLength(1);
      vi.advanceTimersByTime(200);
      expect(received.at(-1)).toEqual(
        MarketActions.quotesSubscriptionChanged({ key: SCREENER_SUBSCRIPTION, series: [3, 4, 5] }),
      );

      actions$.next(MarketActions.leaveScreenerPage());
      vi.advanceTimersByTime(200);
      store.overrideSelector(selectScreenerWindowSeries, [9]);
      store.refreshState();
      vi.advanceTimersByTime(200);
      expect(received).toHaveLength(2);
    });

    it('ends the subscription when the page is left', async () => {
      const result = firstValueFrom(effects.leaveScreenerPage$);
      actions$.next(MarketActions.leaveScreenerPage());
      expect(await result).toEqual(
        MarketActions.quotesSubscriptionEnded({ key: SCREENER_SUBSCRIPTION }),
      );
    });
  });

  describe('overview sparklines', () => {
    function open(): void {
      store.overrideSelector(selectOverviewIndexSeries, [20, 21]);
      store.overrideSelector(selectInstrumentsLoaded, true);
      store.overrideSelector(selectTick, NOW);
      store.refreshState();
    }

    it('loads the 15-minute candles of every index and again after a gap of one', () => {
      const candles = vi.spyOn(engine, 'candles').mockReturnValue(
        of({
          kind: 'candles' as const,
          series: 20,
          interval: '15m' as const,
          tick: NOW,
          candles: [candle(FRIDAY)],
          hasOlder: false,
        }),
      );
      const received: Action[] = [];
      subscription = effects.loadOverviewSparklines$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterMarketsPage());
      open();
      // Mon 01.04.2030 08:00: from Friday 29.03.2030, the market day before.
      const request = { interval: '15m', from: tickAt(2030, 3, 29), limit: 2_000 };
      expect(candles.mock.calls).toEqual([
        [{ series: 20, ...request }],
        [{ series: 21, ...request }],
      ]);
      expect(received).toEqual([
        MarketActions.retrievedOverviewSparkline({ series: 20, candles: [candle(FRIDAY)] }),
        MarketActions.retrievedOverviewSparkline({ series: 21, candles: [candle(FRIDAY)] }),
      ]);

      actions$.next(MarketActions.detectedOverviewSparklineGap({ series: 21 }));
      expect(candles.mock.calls.at(-1)).toEqual([{ series: 21, ...request }]);
      expect(candles).toHaveBeenCalledTimes(3);
    });

    it('turns live candles into changes and gaps of the sparkline', () => {
      const received: Action[] = [];
      subscription = effects.watchOverviewSparklines$.subscribe((action) => received.push(action));
      store.overrideSelector(selectOverviewSparklines, {
        20: { candles: [candle(NOW)], loading: false },
        21: { candles: [], loading: true },
      });
      actions$.next(MarketActions.enterMarketsPage());
      open();
      expect(worker.subscriptions().map(({ payload }) => payload.charts)).toEqual([
        [{ series: 20, interval: '15m' }],
        [{ series: 21, interval: '15m' }],
      ]);

      const event = (series: number, at: number, previous?: Candle) => ({
        tick: at,
        series,
        interval: '15m' as const,
        candle: candle(at, 12),
        ...(previous === undefined ? {} : { previous }),
      });
      worker.emit('candle', event(20, NOW));
      // The index whose block loads waits for it.
      worker.emit('candle', event(21, NOW));
      worker.emit('candle', event(20, NOW + 30, candle(NOW + 15)));
      expect(received).toEqual([
        MarketActions.receivedOverviewSparklineCandle({
          series: 20,
          live: { candle: candle(NOW, 12) },
        }),
        MarketActions.detectedOverviewSparklineGap({ series: 20 }),
      ]);
    });
  });

  describe('changeWatchlist$', () => {
    function setWatchlist(ids: string[], known = true): void {
      store.overrideSelector(selectWatchlistIds, ids);
      store.overrideSelector(selectWatchlistKnown, known);
      store.refreshState();
    }

    it('requests the complete new list built on the shown one', async () => {
      setWatchlist(['a', 'b', 'c']);
      const result = firstValueFrom(effects.changeWatchlist$.pipe(take(4), toArray()));
      actions$.next(MarketActions.clickedAddToWatchlist({ id: 'd' }));
      actions$.next(MarketActions.clickedRemoveFromWatchlist({ id: 'b' }));
      actions$.next(MarketActions.droppedWatchlistItem({ from: 0, to: 2 }));
      actions$.next(MarketActions.movedWatchlistItem({ from: 2, to: 1 }));
      expect(await result).toEqual([
        MarketActions.requestedWatchlist({ ids: ['a', 'b', 'c', 'd'] }),
        MarketActions.requestedWatchlist({ ids: ['a', 'c'] }),
        MarketActions.requestedWatchlist({ ids: ['b', 'c', 'a'] }),
        MarketActions.requestedWatchlist({ ids: ['a', 'c', 'b'] }),
      ]);
    });

    it('requests nothing before the list is known or when nothing changes', () => {
      const requested = vi.fn();
      subscription = effects.changeWatchlist$.subscribe(requested);
      setWatchlist([], false);
      actions$.next(MarketActions.clickedAddToWatchlist({ id: 'a' }));
      setWatchlist(['a', 'b']);
      actions$.next(MarketActions.clickedAddToWatchlist({ id: 'a' }));
      actions$.next(MarketActions.clickedRemoveFromWatchlist({ id: 'x' }));
      actions$.next(MarketActions.movedWatchlistItem({ from: 1, to: 1 }));
      actions$.next(MarketActions.movedWatchlistItem({ from: 1, to: 2 }));
      expect(requested).not.toHaveBeenCalled();
    });
  });

  describe('updateWatchlist$', () => {
    it('sends quick requests one after the other in their order', () => {
      const replies = [new Subject<{ tick: number }>(), new Subject<{ tick: number }>()];
      const update = vi
        .spyOn(engine, 'updateWatchlist')
        .mockReturnValueOnce(replies[0])
        .mockReturnValueOnce(replies[1]);
      const results: Action[] = [];
      subscription = effects.updateWatchlist$.subscribe((action) => results.push(action));
      actions$.next(MarketActions.requestedWatchlist({ ids: ['a'] }));
      actions$.next(MarketActions.requestedWatchlist({ ids: ['a', 'b'] }));
      expect(update.mock.calls).toEqual([[['a']]]);

      replies[0].next({ tick: 1 });
      replies[0].complete();
      expect(update.mock.calls).toEqual([[['a']], [['a', 'b']]]);
      replies[1].next({ tick: 2 });
      replies[1].complete();
      expect(results).toEqual([
        MarketActions.updateWatchlistSuccess({ ids: ['a'] }),
        MarketActions.updateWatchlistSuccess({ ids: ['a', 'b'] }),
      ]);
    });

    it('dispatches updateWatchlistFailure with the list when the engine rejects it', async () => {
      const error = new EngineCommandError('busy');
      vi.spyOn(engine, 'updateWatchlist').mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.updateWatchlist$);
      actions$.next(MarketActions.requestedWatchlist({ ids: ['a'] }));
      expect(await result).toEqual(MarketActions.updateWatchlistFailure({ ids: ['a'], error }));
    });
  });

  describe('showWatchlistFailure$', () => {
    // TS §8.2: the codes of `updateWatchlist`, plus a running jump and a failed write
    it.each([
      ['unknown-instrument', 'Dieses Wertpapier gibt es nicht. Die Watchlist bleibt unverändert.'],
      ['duplicate-instrument', 'Dieses Wertpapier steht schon auf der Watchlist.'],
      ['watchlist-too-long', 'Die Watchlist ist voll. Sie fasst höchstens 50 Wertpapiere.'],
      [
        'busy',
        'Die Watchlist lässt sich gerade nicht ändern, weil die Spielzeit noch berechnet wird.',
      ],
      [
        'storage-failed',
        'Die Änderung der Watchlist konnte nicht gespeichert werden und wurde zurückgenommen.',
      ],
      [
        'worker-failed',
        'Die Watchlist konnte nicht geändert werden. Die Änderung wurde zurückgenommen.',
      ],
    ] as const)('explains %s', (code, text) => {
      subscription = effects.showWatchlistFailure$.subscribe();
      actions$.next(
        MarketActions.updateWatchlistFailure({ ids: [], error: new EngineCommandError(code) }),
      );
      expect(toasts.error).toHaveBeenCalledWith(text);
    });
  });

  describe('enterWatchlistPage$', () => {
    it('watches the series of the list once the instruments are known, follows it and ends', () => {
      const results: Action[] = [];
      subscription = effects.enterWatchlistPage$.subscribe((action) => results.push(action));
      store.overrideSelector(selectWatchlistSeries, [4, 2]);
      store.refreshState();
      actions$.next(MarketActions.enterWatchlistPage());
      expect(results).toEqual([]);
      store.overrideSelector(selectInstrumentsLoaded, true);
      store.refreshState();
      store.overrideSelector(selectWatchlistSeries, [2]);
      store.refreshState();
      actions$.next(MarketActions.leaveWatchlistPage());
      store.overrideSelector(selectWatchlistSeries, [1]);
      store.refreshState();
      expect(results).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: WATCHLIST_SUBSCRIPTION, series: [4, 2] }),
        MarketActions.quotesSubscriptionChanged({ key: WATCHLIST_SUBSCRIPTION, series: [2] }),
      ]);
    });
  });

  describe('loadInstrumentDetail$', () => {
    const FIGURES = { id: STOCK.id, series: 7, last: 10 } as InstrumentFigures;
    const DIVIDENDS = { history: [], next: null };

    function showInstrument(id: string, instrument: Instrument | null, generation: number): void {
      store.overrideSelector(selectRouteInstrumentId, id);
      store.overrideSelector(selectRouteInstrument, instrument);
      store.overrideSelector(selectInstrumentDetail, {
        ...initialInstrumentDetailState,
        generation,
      });
      store.overrideSelector(selectInstrumentsLoaded, true);
      store.refreshState();
    }

    function spyQueries() {
      return {
        details: vi.spyOn(engine, 'instrumentDetails').mockReturnValue(
          of({
            kind: 'instrumentDetails' as const,
            details: { kind: 'stock', id: STOCK.id } as InstrumentDetails,
          }),
        ),
        figures: vi
          .spyOn(engine, 'instrumentFigures')
          .mockReturnValue(of({ kind: 'instrumentFigures' as const, figures: FIGURES, tick: NOW })),
        dividends: vi
          .spyOn(engine, 'instrumentDividends')
          .mockReturnValue(of({ kind: 'instrumentDividends' as const, tick: NOW, ...DIVIDENDS })),
        composition: vi
          .spyOn(engine, 'instrumentComposition')
          .mockReturnValue(
            of({ kind: 'instrumentComposition' as const, composition: null, tick: NOW }),
          ),
      };
    }

    it('loads the parts of a share once the master data is there, with the visit generation', () => {
      const queries = spyQueries();
      const received: Action[] = [];
      subscription = effects.loadInstrumentDetail$.subscribe((action) => received.push(action));
      actions$.next(MarketActions.enterInstrumentPage());
      expect(queries.details).not.toHaveBeenCalled();

      showInstrument(STOCK.id, STOCK, 3);
      expect(received).toEqual([
        MarketActions.retrievedInstrumentDetails({
          generation: 3,
          details: { kind: 'stock', id: STOCK.id } as InstrumentDetails,
        }),
        MarketActions.retrievedInstrumentFigures({ generation: 3, figures: FIGURES, tick: NOW }),
        MarketActions.retrievedInstrumentDividends({ generation: 3, dividends: DIVIDENDS }),
      ]);
      // Shares have no composition.
      expect(queries.composition).not.toHaveBeenCalled();
    });

    it('asks for the composition of an ETF and not for the dividends of an accumulating one', () => {
      const queries = spyQueries();
      subscription = effects.loadInstrumentDetail$.subscribe();
      const etf = { id: 'etf-0001', series: 9, kind: 'etf', distribution: 'accumulating' };
      actions$.next(MarketActions.enterInstrumentPage());
      showInstrument(etf.id, etf as Instrument, 1);
      expect(queries.composition).toHaveBeenCalledWith('etf-0001');
      expect(queries.dividends).not.toHaveBeenCalled();
    });

    it('loads figures, dividends and composition again on a new market day and a new session', () => {
      const queries = spyQueries();
      subscription = effects.loadInstrumentDetail$.subscribe();
      actions$.next(MarketActions.enterInstrumentPage());
      showInstrument(STOCK.id, STOCK, 1);
      store.overrideSelector(selectRouteInstrumentSession, 10);
      store.refreshState();
      expect(queries.figures).toHaveBeenCalledTimes(1);

      store.overrideSelector(selectMarketDay, 3_745);
      store.refreshState();
      expect(queries.figures).toHaveBeenCalledTimes(2);
      expect(queries.dividends).toHaveBeenCalledTimes(2);

      // The session opens: the previous close changes.
      store.overrideSelector(selectRouteInstrumentSession, 10.5);
      store.refreshState();
      expect(queries.dividends).toHaveBeenCalledTimes(3);
      expect(queries.details).toHaveBeenCalledTimes(1);

      actions$.next(MarketActions.leaveInstrumentPage());
      store.overrideSelector(selectMarketDay, 3_746);
      store.refreshState();
      expect(queries.figures).toHaveBeenCalledTimes(3);
    });

    it('asks only for the details of an ID the master data does not know', async () => {
      const queries = spyQueries();
      const error = new EngineCommandError('unknown-instrument');
      queries.details.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadInstrumentDetail$);
      actions$.next(MarketActions.enterInstrumentPage());
      showInstrument('stk-9999', null, 2);
      expect(await result).toEqual(
        MarketActions.loadInstrumentDetailFailure({ generation: 2, error }),
      );
      expect(queries.figures).not.toHaveBeenCalled();
    });
  });

  describe('showInstrumentDetailFailure$', () => {
    it('shows a toast for failed queries but not for an unknown instrument', () => {
      subscription = effects.showInstrumentDetailFailure$.subscribe();
      actions$.next(
        MarketActions.loadInstrumentDetailFailure({
          generation: 1,
          error: new EngineCommandError('unknown-instrument'),
        }),
      );
      expect(toasts.error).not.toHaveBeenCalled();
      actions$.next(
        MarketActions.loadInstrumentDetailFailure({
          generation: 1,
          error: new EngineCommandError('worker-failed'),
        }),
      );
      expect(toasts.error).toHaveBeenCalledWith(
        'Die Angaben zum Wertpapier konnten nicht vollständig geladen werden.',
      );
    });
  });
});
