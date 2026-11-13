import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, Subscription, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

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
import { Instrument } from '@app/market/domain/models/instrument.model';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as MarketActions from './market.actions';
import { MarketEffects } from './market.effects';
import {
  INSTRUMENT_PAGE_SUBSCRIPTION,
  MARKETS_PAGE_SUBSCRIPTION,
  QUOTES_BUNDLE_WINDOW_MS,
  QuoteSubscriptions,
} from './market.model';
import {
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

  emit<K extends 'quotes' | 'movers'>(type: K, payload: EngineEventPayloads[K]): void {
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
});
