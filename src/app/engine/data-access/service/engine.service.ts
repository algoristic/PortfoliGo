import { inject, Injectable, OnDestroy } from '@angular/core';
import { defer, filter, map, Observable, Subject, take } from 'rxjs';

import { AccountId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import {
  StandingOrderId,
  StandingOrderSpec,
} from '@app/banking/domain/models/standing-order.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { UPCOMING_DAYS } from '@app/dashboard/domain/models/upcoming.model';
import { BackgroundMode } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { CandleResolution } from '@app/market/domain/models/candle.model';
import { ScreenerCriteria } from '@app/market/domain/models/screener.model';
import { AutoPauseCode } from '@app/notifications/domain/models/notification.model';
import { OrderChange, OrderSpec } from '@app/trading/domain/models/order.model';
import {
  SavingsPlanChange,
  SavingsPlanId,
  SavingsPlanSpec,
} from '@app/trading/domain/models/savings-plan.model';

import {
  ENGINE_COMMAND_ID_PREFIX,
  ENGINE_WORKER_FACTORY,
  MAX_WORKER_FAILURES,
} from './engine-service.config';
import {
  CandlePayload,
  CandlesRequest,
  ChartSubscription,
  ENGINE_PROTOCOL,
  EngineCommandMessage,
  EngineCommandPayloads,
  EngineCommandType,
  EngineErrorCode,
  EngineEventMessage,
  EngineEventPayloads,
  EngineEventType,
  EngineQuery,
  EngineQueryResultOf,
  EngineReplies,
  EngineWorkerPort,
  LoadPlayerPayload,
  MoversPayload,
  NotificationsRequest,
  PerformanceHistoryRequest,
  PerformanceProjectionUpdate,
  PositionTradesRequest,
  SavingsPlansProjectionUpdate,
  StandingOrdersProjectionUpdate,
  StatementRequest,
  TaxesProjectionUpdate,
  TradingProjectionUpdate,
  TransferPayload,
} from './engine-service.model';
import { isEngineEventMessage } from './engine-service.utils';

/** Error codes of the service: the worker's codes plus a failed worker. */
export type EngineServiceErrorCode = EngineErrorCode | 'worker-failed';

/** Error of a command; `code` is what the UI maps to a text (TS §8.6). */
export class EngineCommandError extends Error {
  readonly code: EngineServiceErrorCode;

  constructor(code: EngineServiceErrorCode, message: string = code) {
    super(message);
    this.name = 'EngineCommandError';
    this.code = code;
  }
}

export interface EngineFatal {
  message: string;
  /** `false` after the third failure in a row: the worker is not started again (TS §8.5). */
  restarting: boolean;
}

/**
 * The UI's access to the engine worker (TS §8.2–§8.5). Every command is a cold Observable that
 * posts the command on subscription and emits the data of its reply; an error reply errors with
 * an `EngineCommandError`. Unsubscribing before the reply ignores it; the command still runs.
 *
 * A failing worker (`error`, `messageerror`, `fatal`) is restarted and the last loaded player is
 * loaded again with the open subscriptions; after three failures in a row without progress of the
 * game time beyond the last failure, the service gives up.
 */
@Injectable()
export class EngineService implements OnDestroy {
  readonly #createWorker = inject(ENGINE_WORKER_FACTORY);
  /** Unique per service, so that command IDs never repeat after a page reload (TS §8.5). */
  readonly #idPrefix = inject(ENGINE_COMMAND_ID_PREFIX)();
  readonly #events = new Subject<EngineEventMessage>();
  /** Ends the open commands when the worker fails. */
  readonly #failures = new Subject<EngineCommandError>();
  readonly #fatal = new Subject<EngineFatal>();
  /** Subscribers per series (TS §8.4). */
  readonly #quoteCounts = new Map<number, number>();
  /** Subscribers of the topic `movers`. */
  #moversCount = 0;
  /** Subscribers per chart (series and interval), by `series/interval`. */
  readonly #chartCounts = new Map<string, { chart: ChartSubscription; count: number }>();
  #worker?: EngineWorkerPort;
  #nextId = 1;
  #lastLoad?: LoadPlayerPayload;
  #visible?: boolean;
  #lastTick?: Tick;
  #failureTick?: Tick;
  #failuresInRow = 0;
  #givenUp = false;

  clock$ = this.#payloads('clock');
  progress$ = this.#payloads('progress');
  /**
   * Changed accounts and the net worth (TS §8.3, §8.4), at most four times per second; a full one
   * after every `loadPlayer`, also after a worker restart.
   */
  projection$ = this.#payloads('projection');
  /**
   * Orders and holdings per depot (AP 5.1, TS §8.3) from the projections that carry them: all of
   * them after every `loadPlayer` (`full`), else the changed orders and depots.
   */
  trading$: Observable<TradingProjectionUpdate> = this.projection$.pipe(
    filter((payload) => payload.trading !== undefined),
    map(({ tick, full, trading }) => ({
      tick,
      full,
      orders: trading?.orders ?? [],
      depots: trading?.depots ?? [],
    })),
  );
  /**
   * Running and closed tax years (AP 5.3, TS §7.7) from the projections that carry them: after
   * every `loadPlayer` and whenever the tax year changed.
   */
  taxes$: Observable<TaxesProjectionUpdate> = this.projection$.pipe(
    map(({ tick, full, taxes }) => (taxes === undefined ? null : { tick, full, ...taxes })),
    filter((update) => update !== null),
  );
  /**
   * All standing orders with their next execution (AP 5.6a, TS §8.3): after every `loadPlayer` and
   * whenever one was created, changed, paused, resumed, deleted or executed.
   */
  standingOrders$: Observable<StandingOrdersProjectionUpdate> = this.projection$.pipe(
    map(({ tick, full, standingOrders }) =>
      standingOrders === undefined ? null : { tick, full, standingOrders },
    ),
    filter((update) => update !== null),
  );
  /**
   * All savings plans with their next execution (AP 5.6b, TS §8.3): after every `loadPlayer` and
   * whenever one was created, changed, paused, resumed, deleted or executed.
   */
  savingsPlans$: Observable<SavingsPlansProjectionUpdate> = this.projection$.pipe(
    map(({ tick, full, savingsPlans }) =>
      savingsPlans === undefined ? null : { tick, full, savingsPlans },
    ),
    filter((update) => update !== null),
  );
  /**
   * Live performance figures (AP 5.7, US-PF-01, US-PF-05, TS §7.9) from every projection: net
   * worth, change today and since the start without external flows, time-weighted returns,
   * benchmark and second comparison value.
   */
  performance$: Observable<PerformanceProjectionUpdate> = this.projection$.pipe(
    map(({ tick, full, performance }) =>
      performance === undefined ? null : { tick, full, figures: performance },
    ),
    filter((update) => update !== null),
  );
  /**
   * New notifications (TS §8.3, §12) as the worker bundles them; none while catching up, those are
   * in the absence report.
   */
  notification$ = this.#payloads('notification');
  /** Absence report after a catch-up or a hidden period (US-BN-03). */
  report$ = this.#payloads('report');
  /** Problems the engine survives, e.g. failed periodic writes (TS §9.5). */
  warning$ = this.#payloads('warning');
  fatal$ = this.#fatal.asObservable();

  loadPlayer(payload: LoadPlayerPayload): Observable<EngineReplies['loadPlayer']> {
    return defer(() => {
      this.#lastLoad = payload;
      return this.#request('loadPlayer', payload);
    });
  }

  unloadPlayer(): Observable<null> {
    return defer(() => {
      this.#lastLoad = undefined;
      return this.#request('unloadPlayer', {});
    });
  }

  setSpeed(speed: SpeedId): Observable<null> {
    return this.#request('setSpeed', { speed });
  }

  pause(): Observable<null> {
    return this.#request('pause', {});
  }

  resume(): Observable<null> {
    return this.#request('resume', {});
  }

  setVisibility(visible: boolean): Observable<null> {
    return defer(() => {
      this.#visible = visible;
      return this.#request('setVisibility', { visible });
    });
  }

  jumpTo(target: JumpTarget): Observable<EngineReplies['jumpTo']> {
    return this.#request('jumpTo', { target });
  }

  cancelJump(): Observable<null> {
    return this.#request('cancelJump', {});
  }

  /** The exchanges of the world (TS §3.3); the other queries have their own methods. */
  query(query: { kind: 'exchanges' }): Observable<EngineQueryResultOf<'exchanges'>> {
    return this.#query(query);
  }

  /** Banks of the world with their conditions (bank comparison, account cards). */
  banks(): Observable<EngineQueryResultOf<'banks'>> {
    return this.#query({ kind: 'banks' });
  }

  /**
   * What closing the account now would book, and what blocks it (TS §7.4); fails with
   * `unknown-account` or `account-closed`.
   */
  closingPreview(accountId: AccountId): Observable<EngineQueryResultOf<'closingPreview'>> {
    return this.#query({ kind: 'closingPreview', accountId });
  }

  /** The closed household months and the running one (US-EK-03). */
  monthlyValues(): Observable<EngineQueryResultOf<'monthlyValues'>> {
    return this.#query({ kind: 'monthlyValues' });
  }

  /**
   * One page of an account's statement up to the current tick (TS §7.2, §8.2); closed accounts
   * included, `unknown-account` for others.
   */
  statement(request: StatementRequest): Observable<EngineQueryResultOf<'statement'>> {
    return this.#query({ kind: 'statement', ...request });
  }

  /**
   * One page of the notification centre up to the current tick (US-BN-01), newest first, with the
   * read state.
   */
  notifications(request: NotificationsRequest): Observable<EngineQueryResultOf<'notifications'>> {
    return this.#query({ kind: 'notifications', ...request });
  }

  /** The last absence report since the player was loaded, if the UI missed the `report` event. */
  absenceReport(): Observable<EngineQueryResultOf<'absenceReport'>> {
    return this.#query({ kind: 'absenceReport' });
  }

  /**
   * Master data of all series (TS §8.2, AP 4.1): shares, price and total return indices, ETFs. It
   * doesn't change during a game, so one query after `loadPlayer` is enough.
   */
  instruments(): Observable<EngineQueryResultOf<'instruments'>> {
    return this.#query({ kind: 'instruments' });
  }

  /** Static details of one series; fails with `unknown-instrument` for an unknown ID. */
  instrumentDetails(id: string): Observable<EngineQueryResultOf<'instrumentDetails'>> {
    return this.#query({ kind: 'instrumentDetails', id });
  }

  /**
   * Key figures of one series at the current tick (TS §8.2, US-MK-03): market capitalisation,
   * dividend yield, volatility, beta, performance 1M/1Y/5Y and the indicative value; fails with
   * `unknown-instrument` for an unknown ID.
   */
  instrumentFigures(id: string): Observable<EngineQueryResultOf<'instrumentFigures'>> {
    return this.#query({ kind: 'instrumentFigures', id });
  }

  /**
   * Dividend history up to now and the next ex-date of a share or distributing ETF (TS §6.5,
   * US-MK-03, US-MK-06); the amount of the next date only once announced.
   */
  instrumentDividends(id: string): Observable<EngineQueryResultOf<'instrumentDividends'>> {
    return this.#query({ kind: 'instrumentDividends', id });
  }

  /**
   * Composition of an index or of the index an ETF tracks (TS §8.2, US-MK-03): largest positions
   * and the weights per region and sector; `null` for shares.
   */
  instrumentComposition(id: string): Observable<EngineQueryResultOf<'instrumentComposition'>> {
    return this.#query({ kind: 'instrumentComposition', id });
  }

  /**
   * The screener up to the current tick (TS §8.2, US-MK-02): all matches with their figures and
   * a one-month sparkline, sorted.
   */
  screener(criteria: ScreenerCriteria): Observable<EngineQueryResultOf<'screener'>> {
    return this.#query({ ...criteria, kind: 'screener' });
  }

  /**
   * A block of candles up to the current tick (TS §8.2, US-CH-01): the newest `limit` candles in
   * `[from, to]`, ascending, and whether older ones exist. Older blocks for scrolling: `to` = start
   * of the oldest loaded candle − 1. Fails with `unknown-instrument` for an unknown series.
   */
  candles(request: CandlesRequest): Observable<EngineQueryResultOf<'candles'>> {
    return this.#query({ ...request, kind: 'candles' });
  }

  /**
   * The daily series (TS §7.9, §8.2, US-PF-04, US-PF-05) from `fromDay` (default: the start of the
   * game) up to the last day that ended, thinned to at most `maxPoints` points.
   */
  performanceHistory(
    request: PerformanceHistoryRequest = {},
  ): Observable<EngineQueryResultOf<'performanceHistory'>> {
    return this.#query({ ...request, kind: 'performanceHistory' });
  }

  /**
   * Plannable dates of the next `days` days that only the worker knows (TS §8.1, §8.2, E-05);
   * standing orders, savings plans and order expiries come with the projection.
   */
  upcoming(days: number = UPCOMING_DAYS): Observable<EngineQueryResultOf<'upcoming'>> {
    return this.#query({ kind: 'upcoming', days });
  }

  /**
   * Purchases and sales of an instrument from the journal (TS §8.2, US-PF-06): order executions
   * and savings plan purchases in one depot or all depots, the newest first.
   */
  positionTrades(
    request: PositionTradesRequest,
  ): Observable<EngineQueryResultOf<'positionTrades'>> {
    return this.#query({ ...request, kind: 'positionTrades' });
  }

  /** Switches the auto-pause of a notification code (TS §12, US-ZT-06). */
  setAutoPause(code: AutoPauseCode, enabled: boolean): Observable<EngineReplies['setAutoPause']> {
    return this.#request('setAutoPause', { code, enabled });
  }

  /**
   * Marks notifications as read: all up to `upTo` (for "all read" the `lastSeq` of the projection)
   * and the single ones in `seqs`.
   */
  markNotificationsRead(request: {
    upTo?: number;
    seqs?: number[];
  }): Observable<EngineReplies['markNotificationsRead']> {
    return this.#request('markNotificationsRead', { ...request });
  }

  /** Replaces the watchlist with `ids` in this order (US-MK-04). */
  updateWatchlist(ids: readonly string[]): Observable<EngineReplies['updateWatchlist']> {
    return this.#request('updateWatchlist', { ids: [...ids] });
  }

  setBackgroundMode(mode: BackgroundMode): Observable<EngineReplies['setBackgroundMode']> {
    return this.#request('setBackgroundMode', { mode });
  }

  /** Opens an account, or a depot with its clearing account (`kind: 'depot'`). */
  openAccount(bankId: string, kind: OpenableAccountKind): Observable<EngineReplies['openAccount']> {
    return this.#request('openAccount', { bankId, kind });
  }

  /** Closes an account; a remainder after the settlement goes to `targetAccountId`. */
  closeAccount(
    accountId: AccountId,
    targetAccountId?: AccountId,
  ): Observable<EngineReplies['closeAccount']> {
    return this.#request(
      'closeAccount',
      targetAccountId === undefined ? { accountId } : { accountId, targetAccountId },
    );
  }

  setSalaryAccount(accountId: AccountId): Observable<EngineReplies['setSalaryAccount']> {
    return this.#request('setSalaryAccount', { accountId });
  }

  transfer(transfer: TransferPayload): Observable<EngineReplies['transfer']> {
    return this.#request('transfer', { ...transfer });
  }

  /** Creates a standing order (US-BK-10, TS §7.4) and answers with its ID. */
  createStandingOrder(order: StandingOrderSpec): Observable<EngineReplies['createStandingOrder']> {
    return this.#request('createStandingOrder', { order: { ...order } });
  }

  changeStandingOrder(
    standingOrderId: StandingOrderId,
    order: StandingOrderSpec,
  ): Observable<EngineReplies['changeStandingOrder']> {
    return this.#request('changeStandingOrder', { standingOrderId, order: { ...order } });
  }

  setStandingOrderPaused(
    standingOrderId: StandingOrderId,
    paused: boolean,
  ): Observable<EngineReplies['setStandingOrderPaused']> {
    return this.#request('setStandingOrderPaused', { standingOrderId, paused });
  }

  deleteStandingOrder(
    standingOrderId: StandingOrderId,
  ): Observable<EngineReplies['deleteStandingOrder']> {
    return this.#request('deleteStandingOrder', { standingOrderId });
  }

  /**
   * Places an order (US-HD-01–03, TS §7.5) and answers with its ID; the engine checks it at once
   * and executes it in the same tick when its exchange is open and its condition holds.
   */
  placeOrder(order: OrderSpec): Observable<EngineReplies['placeOrder']> {
    return this.#request('placeOrder', { order });
  }

  /** New limit, stop or validity of an active order (US-HD-04). */
  changeOrder(orderId: string, change: OrderChange): Observable<EngineReplies['changeOrder']> {
    return this.#request('changeOrder', { orderId, change });
  }

  /** Cancels an active order (US-HD-04). */
  cancelOrder(orderId: string): Observable<EngineReplies['cancelOrder']> {
    return this.#request('cancelOrder', { orderId });
  }

  /** Creates a savings plan (US-HD-05, TS §7.8) and answers with its ID. */
  createSavingsPlan(plan: SavingsPlanSpec): Observable<EngineReplies['createSavingsPlan']> {
    return this.#request('createSavingsPlan', { plan: { ...plan } });
  }

  changeSavingsPlan(
    savingsPlanId: SavingsPlanId,
    change: SavingsPlanChange,
  ): Observable<EngineReplies['changeSavingsPlan']> {
    return this.#request('changeSavingsPlan', { savingsPlanId, change: { ...change } });
  }

  setSavingsPlanPaused(
    savingsPlanId: SavingsPlanId,
    paused: boolean,
  ): Observable<EngineReplies['setSavingsPlanPaused']> {
    return this.#request('setSavingsPlanPaused', { savingsPlanId, paused });
  }

  deleteSavingsPlan(savingsPlanId: SavingsPlanId): Observable<EngineReplies['deleteSavingsPlan']> {
    return this.#request('deleteSavingsPlan', { savingsPlanId });
  }

  /**
   * Quotes of `series` (TS §8.4) as the worker sends them, at most four times per second. The
   * worker gets one `subscribe` per series however many views watch it, and the `unsubscribe` when
   * the last of them unsubscribes.
   */
  quotes(series: readonly number[]): Observable<SeriesQuote[]> {
    return new Observable<SeriesQuote[]>((subscriber) => {
      const wanted = new Set(series);
      const added = [...wanted].filter((s) => {
        const count = this.#quoteCounts.get(s) ?? 0;
        this.#quoteCounts.set(s, count + 1);
        return count === 0;
      });
      if (added.length > 0) {
        this.#notify('subscribe', { series: added });
      }
      const subscription = this.#payloads('quotes').subscribe(({ quotes }) => {
        const mine = quotes.filter((quote) => wanted.has(quote.series));
        if (mine.length > 0) {
          subscriber.next(mine);
        }
      });
      return () => {
        subscription.unsubscribe();
        const removed = [...wanted].filter((s) => {
          const count = (this.#quoteCounts.get(s) ?? 1) - 1;
          if (count > 0) {
            this.#quoteCounts.set(s, count);
            return false;
          }
          this.#quoteCounts.delete(s);
          return true;
        });
        if (removed.length > 0) {
          this.#notify('unsubscribe', { series: removed });
        }
      };
    });
  }

  /**
   * Gainers, losers and sector indices of the day (TS §8.3, §8.4), at most four times per second.
   * The worker gets one subscription however many views watch, and its end with the last one.
   */
  movers(): Observable<MoversPayload> {
    return new Observable<MoversPayload>((subscriber) => {
      this.#moversCount++;
      if (this.#moversCount === 1) {
        this.#notify('subscribe', { series: [], movers: true });
      }
      const subscription = this.#payloads('movers').subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        this.#moversCount--;
        if (this.#moversCount === 0) {
          this.#notify('unsubscribe', { series: [], movers: true });
        }
      };
    });
  }

  /**
   * The newest candle of a chart (TS §8.3, §8.4) whenever it changes, at most four times per
   * second; with `previous` when a new candle began. The worker gets one subscription per series
   * and interval however many views watch it, and its end with the last one.
   */
  chartCandles(series: number, interval: CandleResolution): Observable<CandlePayload> {
    return new Observable<CandlePayload>((subscriber) => {
      const key = `${series}/${interval}`;
      const entry = this.#chartCounts.get(key) ?? { chart: { series, interval }, count: 0 };
      entry.count++;
      this.#chartCounts.set(key, entry);
      if (entry.count === 1) {
        this.#notify('subscribe', { series: [], charts: [{ series, interval }] });
      }
      const subscription = this.#payloads('candle')
        .pipe(filter((payload) => payload.series === series && payload.interval === interval))
        .subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        entry.count--;
        if (entry.count === 0) {
          this.#chartCounts.delete(key);
          this.#notify('unsubscribe', { series: [], charts: [{ series, interval }] });
        }
      };
    });
  }

  ngOnDestroy(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
  }

  #query<Q extends EngineQuery>(query: Q): Observable<EngineQueryResultOf<Q['kind']>> {
    // The worker answers a query with the result of its kind.
    return this.#request('query', { query }) as Observable<EngineQueryResultOf<Q['kind']>>;
  }

  #payloads<K extends EngineEventType>(type: K): Observable<EngineEventPayloads[K]> {
    return this.#events.pipe(
      filter(
        (message): message is Extract<EngineEventMessage, { type: K }> => message.type === type,
      ),
      map((message) => message.payload as EngineEventPayloads[K]),
    );
  }

  #request<K extends EngineCommandType>(
    type: K,
    payload: EngineCommandPayloads[K],
  ): Observable<EngineReplies[K]> {
    return new Observable<EngineReplies[K]>((subscriber) => {
      if (this.#givenUp) {
        subscriber.error(new EngineCommandError('worker-failed', 'the engine worker was given up'));
        return undefined;
      }
      const message = this.#message(type, payload);
      const subscription = this.#events
        .pipe(
          filter((event) => event.type === 'reply' && event.replyTo === message.id),
          take(1),
        )
        .subscribe((event) => {
          const reply = event.payload as EngineEventPayloads['reply'];
          if (reply.ok) {
            // The worker answers a command with the reply data of its type.
            subscriber.next(reply.data as EngineReplies[K]);
            subscriber.complete();
          } else {
            subscriber.error(new EngineCommandError(reply.error, reply.message));
          }
        });
      subscription.add(this.#failures.pipe(take(1)).subscribe((error) => subscriber.error(error)));
      this.#ensureWorker().postMessage(message);
      return subscription;
    });
  }

  /** Posts a command whose reply nobody waits for (subscriptions, restart). */
  #notify<K extends EngineCommandType>(type: K, payload: EngineCommandPayloads[K]): void {
    if (!this.#givenUp) {
      this.#ensureWorker().postMessage(this.#message(type, payload));
    }
  }

  #message<K extends EngineCommandType>(
    type: K,
    payload: EngineCommandPayloads[K],
  ): EngineCommandMessage {
    return {
      protocol: ENGINE_PROTOCOL,
      id: `u-${this.#idPrefix}-${this.#nextId++}`,
      type,
      payload,
    } as EngineCommandMessage;
  }

  #ensureWorker(): EngineWorkerPort {
    if (this.#worker === undefined) {
      const worker = this.#createWorker();
      worker.addEventListener('message', ({ data }) => {
        if (this.#worker !== worker || !isEngineEventMessage(data)) {
          return;
        }
        if (data.type === 'fatal') {
          this.#fail(worker, data.payload.message);
          return;
        }
        if (data.type === 'clock') {
          this.#onTick(data.payload.tick);
        }
        this.#events.next(data);
      });
      const onError = (event: Event): void => {
        if (this.#worker === worker) {
          const detail = event instanceof ErrorEvent && event.message ? event.message : event.type;
          this.#fail(worker, `the engine worker failed: ${detail}`);
        }
      };
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onError);
      this.#worker = worker;
    }
    return this.#worker;
  }

  /** Progress of the game time beyond the last failure ends a row of failures. */
  #onTick(tick: Tick): void {
    this.#lastTick = tick;
    if (this.#failureTick !== undefined && tick > this.#failureTick) {
      this.#failuresInRow = 0;
      this.#failureTick = undefined;
    }
  }

  #fail(worker: EngineWorkerPort, message: string): void {
    worker.terminate();
    this.#worker = undefined;
    this.#failuresInRow++;
    this.#failureTick = this.#lastTick;
    this.#givenUp = this.#failuresInRow >= MAX_WORKER_FAILURES;
    const restarting = !this.#givenUp && this.#lastLoad !== undefined;
    this.#failures.next(new EngineCommandError('worker-failed', message));
    this.#fatal.next({ message, restarting });
    if (restarting) {
      this.#restart();
    }
  }

  /** New worker with the last loaded player, the visibility and the open subscriptions. */
  #restart(): void {
    if (this.#visible !== undefined) {
      this.#notify('setVisibility', { visible: this.#visible });
    }
    const load = this.#lastLoad;
    if (load !== undefined) {
      const worker = this.#ensureWorker();
      this.#request('loadPlayer', load).subscribe({
        error: (error: unknown) => {
          if (
            this.#worker === worker &&
            !(error instanceof EngineCommandError && error.code === 'worker-failed')
          ) {
            this.#fail(worker, error instanceof Error ? error.message : String(error));
          }
        },
      });
    }
    const series = [...this.#quoteCounts.keys()];
    const charts = [...this.#chartCounts.values()].map(({ chart }) => ({ ...chart }));
    if (series.length > 0 || this.#moversCount > 0 || charts.length > 0) {
      this.#notify('subscribe', {
        series,
        ...(this.#moversCount > 0 ? { movers: true } : {}),
        ...(charts.length > 0 ? { charts } : {}),
      });
    }
  }
}
