import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, Subscription, throwError } from 'rxjs';
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
import { Candle } from '@app/market/domain/models/candle.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as MarketActions from './market.actions';
import { MarketEffects } from './market.effects';
import {
  ChartSubscription,
  INSTRUMENT_PAGE_SUBSCRIPTION,
  InstrumentChartState,
  MARKETS_PAGE_SUBSCRIPTION,
  QUOTES_BUNDLE_WINDOW_MS,
  QuoteSubscriptions,
} from './market.model';
import { initialChartState } from './market.reducer';
import {
  selectChart,
  selectChartSubscription,
  selectInstrumentsLoaded,
  selectMoversWanted,
  selectOverviewIndexSeries,
  selectQuoteSubscriptions,
  selectRouteInstrument,
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
            { selector: selectTick, value: null },
            { selector: selectChart, value: initialChartState },
            { selector: selectChartSubscription, value: { interval: '1m', live: true } },
          ],
        }),
      ],
    });
    effects = TestBed.inject(MarketEffects);
    engine = TestBed.inject(EngineService);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
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
});
