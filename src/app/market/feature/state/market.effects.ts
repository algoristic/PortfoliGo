import { inject, Injectable, PendingTasks } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { Action, select, Store } from '@ngrx/store';
import {
  asyncScheduler,
  buffer,
  catchError,
  concat,
  concatMap,
  connect,
  debounceTime,
  defer,
  distinctUntilChanged,
  EMPTY,
  exhaustMap,
  filter,
  finalize,
  from,
  groupBy,
  ignoreElements,
  map,
  merge,
  mergeMap,
  Observable,
  of,
  skip,
  skipWhile,
  Subscription,
  switchMap,
  take,
  takeUntil,
  tap,
  throttleTime,
  timer,
} from 'rxjs';

import { selectTick } from '@app/clock/feature/state/clock.selectors';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase } from '@app/engine/feature/state/session.selectors';
import {
  chartStartRequest,
  liveCandleStep,
  olderChartRequest,
  trimChartBlock,
} from '@app/market/domain/chart-view-logic';
import { Instrument } from '@app/market/domain/models/instrument.model';
import {
  OVERVIEW_SPARKLINE_INTERVAL,
  overviewSparklineRequest,
  overviewSparklineStep,
} from '@app/market/domain/overview-sparkline-logic';
import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as MarketActions from './market.actions';
import {
  CHART_SETTINGS_VERSION,
  ChartSubscription,
  INSTRUMENT_PAGE_SUBSCRIPTION,
  MARKETS_PAGE_SUBSCRIPTION,
  QUOTES_BUNDLE_WINDOW_MS,
  QuoteSubscriptions,
  SCREENER_SCROLL_THROTTLE_MS,
  SCREENER_SEARCH_DEBOUNCE_MS,
  SCREENER_SUBSCRIPTION,
} from './market.model';
import {
  selectChart,
  selectChartSettings,
  selectChartSubscription,
  selectInstrumentsLoaded,
  selectMarketDay,
  selectMoversWanted,
  selectOverviewIndexSeries,
  selectOverviewSparklines,
  selectQuoteSubscriptions,
  selectRouteInstrument,
  selectScreener,
  selectScreenerCriteria,
  selectScreenerWindowSeries,
} from './market.selectors';
import { latestQuotes, parseChartSettings, sameSeries } from './market.utils';

@Injectable()
export class MarketEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);
  readonly #store = inject(Store);
  readonly #toastService = inject(ToastService);
  readonly #pendingTasks = inject(PendingTasks);
  readonly #localStorage = inject(LocalStorageService);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /** Actions after which the chart loads a new start block (a new generation). */
  readonly #chartRestarted$ = this.#actions$.pipe(
    ofType(
      MarketActions.enterInstrumentPage,
      MarketActions.leaveInstrumentPage,
      MarketActions.clickedChartRange,
      MarketActions.clickedChartDay,
      MarketActions.submittedChartDate,
      MarketActions.detectedChartGap,
    ),
  );

  /** Master data of all series (TS §8.2); it doesn't change during a game. */
  loadInstruments$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.loadPlayerSuccess),
      switchMap(() =>
        this.#engine.instruments().pipe(
          map(({ instruments }) => MarketActions.retrievedInstruments({ instruments })),
          catchError((error: unknown) => of(MarketActions.loadInstrumentsFailure({ error }))),
          takeUntil(this.#ended$),
        ),
      ),
    ),
  );

  /**
   * One `EngineService.quotes` subscription per key of the slice (TS §8.4, §11.3) from the reply
   * to `loadPlayer` on; a new set of a key replaces its subscription, an ended key and leaving the
   * game end it. The service counts the subscribers per series, so keys with the same series cost
   * one worker subscription. The packages of all keys within `QUOTES_BUNDLE_WINDOW_MS` make one
   * `receivedQuotes`; the window is a pending task, so that tests and `whenStable` wait for it.
   */
  watchQuotes$ = createEffect(() =>
    this.#afterLoad(() =>
      this.#quotesOf(this.#store.pipe(select(selectQuoteSubscriptions))).pipe(
        connect((quotes$) => quotes$.pipe(buffer(quotes$.pipe(exhaustMap(() => this.#window()))))),
        map((packages) => MarketActions.receivedQuotes({ quotes: latestQuotes(packages) })),
      ),
    ),
  );

  /** The movers (TS §8.4) while at least one view watches them. */
  watchMovers$ = createEffect(() =>
    this.#afterLoad(() =>
      this.#store.pipe(
        select(selectMoversWanted),
        distinctUntilChanged(),
        switchMap((wanted) => (wanted ? this.#engine.movers() : EMPTY)),
        map((movers) => MarketActions.receivedMovers({ movers })),
      ),
    ),
  );

  /**
   * The markets page (US-MK-01) watches the movers and the quotes of the overview indices, the
   * latter once the master data is there.
   */
  enterMarketsPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterMarketsPage),
      switchMap(() =>
        concat(
          of(MarketActions.moversSubscriptionStarted({ key: MARKETS_PAGE_SUBSCRIPTION })),
          this.#whenInstrumentsLoaded().pipe(
            concatLatestFrom(() => this.#store.pipe(select(selectOverviewIndexSeries))),
            map(([, series]) =>
              MarketActions.quotesSubscriptionChanged({ key: MARKETS_PAGE_SUBSCRIPTION, series }),
            ),
          ),
        ).pipe(takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveMarketsPage)))),
      ),
    ),
  );

  leaveMarketsPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.leaveMarketsPage),
      switchMap(() => [
        MarketActions.quotesSubscriptionEnded({ key: MARKETS_PAGE_SUBSCRIPTION }),
        MarketActions.moversSubscriptionEnded({ key: MARKETS_PAGE_SUBSCRIPTION }),
      ]),
    ),
  );

  /**
   * The sparklines of the overview indices (US-MK-01): the 15-minute candles of the trading day of
   * every index once the master data is there, and again for an index whose live candles skipped
   * candles or began a new day. A new load of an index replaces its running one.
   */
  loadOverviewSparklines$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterMarketsPage),
      switchMap(() =>
        this.#whenInstrumentsLoaded().pipe(
          concatLatestFrom(() => this.#store.pipe(select(selectOverviewIndexSeries))),
          switchMap(([, series]) =>
            merge(
              from(series),
              this.#actions$.pipe(
                ofType(MarketActions.detectedOverviewSparklineGap),
                map((gap) => gap.series),
              ),
            ),
          ),
          groupBy((series) => series),
          mergeMap((group$) =>
            group$.pipe(switchMap((series) => this.#loadOverviewSparkline(series))),
          ),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveMarketsPage))),
        ),
      ),
    ),
  );

  /**
   * Live 15-minute candles of the overview indices (TS §8.4) while the markets page is open; events
   * of an index whose block loads are dropped, the block brings them.
   */
  watchOverviewSparklines$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterMarketsPage),
      switchMap(() =>
        this.#whenInstrumentsLoaded().pipe(
          concatLatestFrom(() => this.#store.pipe(select(selectOverviewIndexSeries))),
          switchMap(([, series]) =>
            merge(
              ...series.map((index) =>
                this.#engine
                  .chartCandles(index, OVERVIEW_SPARKLINE_INTERVAL)
                  .pipe(map((payload) => ({ series: index, payload }))),
              ),
            ),
          ),
          concatLatestFrom(() => this.#store.pipe(select(selectOverviewSparklines))),
          map(([{ series, payload }, sparklines]) => {
            const sparkline = sparklines[series];
            if (sparkline === undefined || sparkline.loading) {
              return null;
            }
            const live =
              payload.previous === undefined
                ? { candle: payload.candle }
                : { candle: payload.candle, previous: payload.previous };
            switch (overviewSparklineStep(sparkline.candles, live)) {
              case 'ignore':
                return null;
              case 'reload':
                return MarketActions.detectedOverviewSparklineGap({ series });
              default:
                return MarketActions.receivedOverviewSparklineCandle({ series, live });
            }
          }),
          filter((action) => action !== null),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveMarketsPage))),
        ),
      ),
    ),
  );

  /**
   * The screener (US-MK-02, TS §8.2) once the player is loaded: a query on entering, at once after
   * a change of filters or sort, 300 ms after the last keystroke of the search and again when a new
   * market day begins (the performance figures change daily), not on every tick. A new query
   * replaces the running one; the reducer drops answers of older generations.
   */
  loadScreener$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterScreenerPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectPhase),
          filter((phase) => phase === 'loaded'),
          take(1),
          switchMap(() => this.#screenerTriggers()),
          concatLatestFrom(() => [
            this.#store.pipe(select(selectScreenerCriteria)),
            this.#store.pipe(select(selectScreener)),
          ]),
          switchMap(([, criteria, { generation }]) =>
            this.#engine.screener(criteria).pipe(
              map(({ total, rows, tick }) =>
                MarketActions.retrievedScreener({ generation, result: { total, rows, tick } }),
              ),
              catchError((error: unknown) =>
                of(MarketActions.loadScreenerFailure({ generation, error })),
              ),
            ),
          ),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveScreenerPage))),
        ),
      ),
    ),
  );

  /**
   * Live quotes only for the rows the list renders and a buffer around them (TS §8.4), following
   * scrolling and new results at most every `SCREENER_SCROLL_THROTTLE_MS`; leaving ends them.
   */
  watchScreenerQuotes$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterScreenerPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectScreenerWindowSeries),
          // Nothing to watch before the first result; then the first rows subscribe at once.
          skipWhile((series) => series.length === 0),
          distinctUntilChanged(sameSeries),
          throttleTime(SCREENER_SCROLL_THROTTLE_MS, asyncScheduler, {
            leading: true,
            trailing: true,
          }),
          map((series) =>
            MarketActions.quotesSubscriptionChanged({ key: SCREENER_SUBSCRIPTION, series }),
          ),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveScreenerPage))),
        ),
      ),
    ),
  );

  leaveScreenerPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.leaveScreenerPage),
      map(() => MarketActions.quotesSubscriptionEnded({ key: SCREENER_SUBSCRIPTION })),
    ),
  );

  /** The instrument page watches the quote of the instrument of its route, once it is known. */
  enterInstrumentPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterInstrumentPage),
      switchMap(() =>
        this.#whenRouteInstrument().pipe(
          map((instrument) =>
            MarketActions.quotesSubscriptionChanged({
              key: INSTRUMENT_PAGE_SUBSCRIPTION,
              series: [instrument.series],
            }),
          ),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveInstrumentPage))),
        ),
      ),
    ),
  );

  leaveInstrumentPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.leaveInstrumentPage),
      map(() => MarketActions.quotesSubscriptionEnded({ key: INSTRUMENT_PAGE_SUBSCRIPTION })),
    ),
  );

  /**
   * The start block of the chart (TS §11.7) once the instrument and the clock are known: on
   * entering the page, a new period or day, and after skipped live candles. A new block replaces a
   * running query; live 1T and 5T keep the last 1 or 5 days that have candles.
   */
  loadChart$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        MarketActions.enterInstrumentPage,
        MarketActions.clickedChartRange,
        MarketActions.clickedChartDay,
        MarketActions.submittedChartDate,
        MarketActions.detectedChartGap,
      ),
      switchMap(() =>
        this.#whenRouteInstrument().pipe(
          switchMap((instrument) =>
            this.#store.pipe(
              select(selectTick),
              filter((tick): tick is number => tick !== null),
              take(1),
              concatLatestFrom(() => this.#store.pipe(select(selectChart))),
              switchMap(([now, chart]) => {
                if (!chart.loading && !chart.reloading) {
                  return EMPTY;
                }
                const { generation, range, day } = chart;
                return this.#engine
                  .candles({ series: instrument.series, ...chartStartRequest(range, day, now) })
                  .pipe(
                    map((result) => trimChartBlock(range, day, result)),
                    map(({ candles, hasOlder }) =>
                      MarketActions.retrievedChartCandles({ generation, candles, hasOlder }),
                    ),
                    catchError((error: unknown) =>
                      of(MarketActions.loadChartCandlesFailure({ generation, error })),
                    ),
                  );
              }),
            ),
          ),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveInstrumentPage))),
        ),
      ),
    ),
  );

  /**
   * The next older block when the user scrolled to the oldest candle (TS §11.7), until `hasOlder`
   * is `false`; one at a time, ended by a new start block.
   */
  loadOlderChartCandles$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.scrolledToChartStart),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectChart)),
        this.#store.pipe(select(selectRouteInstrument)),
      ]),
      exhaustMap(([, chart, instrument]) => {
        const oldest = chart.candles[0];
        if (!chart.loadingOlder || instrument === null || oldest === undefined) {
          return EMPTY;
        }
        const { generation } = chart;
        return this.#engine
          .candles({ series: instrument.series, ...olderChartRequest(chart.range, oldest.tick) })
          .pipe(
            map(({ candles, hasOlder }) =>
              MarketActions.retrievedOlderChartCandles({ generation, candles, hasOlder }),
            ),
            catchError((error: unknown) =>
              of(MarketActions.loadOlderChartCandlesFailure({ generation, error })),
            ),
            takeUntil(this.#chartRestarted$),
          );
      }),
    ),
  );

  /**
   * Live candles of the chart (TS §8.4) while the instrument page is open and the shown block
   * reaches now (not for a chosen past day). Candles that skip the loaded ones start a new block;
   * events during a running start block are dropped, the block brings them.
   */
  watchChart$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterInstrumentPage),
      switchMap(() =>
        this.#whenRouteInstrument().pipe(
          switchMap((instrument) =>
            this.#store.pipe(
              select(selectChartSubscription),
              distinctUntilChanged(sameChartSubscription),
              switchMap(({ interval, live }) =>
                live ? this.#engine.chartCandles(instrument.series, interval) : EMPTY,
              ),
            ),
          ),
          concatLatestFrom(() => this.#store.pipe(select(selectChart))),
          filter(([, chart]) => !chart.loading && !chart.reloading),
          map(([{ candle, previous }, chart]) => {
            const live = previous === undefined ? { candle } : { candle, previous };
            return { live, chart, step: liveCandleStep(chart.range, chart.candles, live) };
          }),
          filter(({ step }) => step !== 'ignore'),
          map(({ live, chart: { generation }, step }) =>
            step === 'reload'
              ? MarketActions.detectedChartGap({ generation })
              : MarketActions.receivedLiveCandle({ generation, live }),
          ),
          takeUntil(this.#actions$.pipe(ofType(MarketActions.leaveInstrumentPage))),
        ),
      ),
    ),
  );

  /**
   * The chart settings of this device (`pgo.ui.chart`, TS §9.3) when a game is entered; missing or
   * invalid values give the defaults field by field.
   */
  loadChartSettings$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(() =>
        this.#localStorage.get<unknown>('pgo.ui.chart', CHART_SETTINGS_VERSION).pipe(
          map((data) => MarketActions.loadedChartSettings({ settings: parseChartSettings(data) })),
          catchError((error: unknown) => of(MarketActions.loadChartSettingsFailure({ error }))),
        ),
      ),
    ),
  );

  /** Every change of period, chart type or indicators is saved at once. */
  saveChartSettings$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        MarketActions.clickedChartRange,
        MarketActions.clickedChartType,
        MarketActions.clickedChartDay,
        MarketActions.submittedChartDate,
        MarketActions.submittedChartIndicator,
        MarketActions.clickedRemoveChartIndicator,
      ),
      concatLatestFrom(() => this.#store.pipe(select(selectChartSettings))),
      concatMap(([, settings]) =>
        this.#localStorage.set('pgo.ui.chart', CHART_SETTINGS_VERSION, settings).pipe(
          ignoreElements(),
          catchError((error: unknown) => of(MarketActions.saveChartSettingsFailure({ error }))),
        ),
      ),
    ),
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(MarketActions.loadInstrumentsFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureMarket-marketEffects-loadInstrumentsFailure:Die Wertpapiere konnten nicht geladen werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showScreenerFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(MarketActions.loadScreenerFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureMarket-marketEffects-loadScreenerFailure:Die Trefferliste konnte nicht geladen werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showChartFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(MarketActions.loadChartCandlesFailure, MarketActions.loadOlderChartCandlesFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureMarket-marketEffects-loadChartCandlesFailure:Der Kursverlauf konnte nicht geladen werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showChartSettingsFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(MarketActions.saveChartSettingsFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureMarket-marketEffects-saveChartSettingsFailure:Die Chart-Einstellungen gelten nur bis zum Neuladen, weil sie auf diesem Gerät nicht gespeichert werden konnten.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /**
   * Runs `work` for the entered player from its reply to `loadPlayer` on, until the game is left
   * or another player is entered.
   */
  #afterLoad<T>(work: () => Observable<T>): Observable<T> {
    return this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) =>
        this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
          switchMap(work),
          takeUntil(this.#ended$),
        ),
      ),
    );
  }

  /**
   * The quote packages of every key of `subscriptions$`. A key whose set changed subscribes the new
   * set before it ends the old one, so series in both stay subscribed in the worker.
   */
  #quotesOf(subscriptions$: Observable<QuoteSubscriptions>): Observable<SeriesQuote[]> {
    return new Observable<SeriesQuote[]>((subscriber) => {
      const open = new Map<string, { series: readonly number[]; subscription: Subscription }>();
      const subscription = subscriptions$.subscribe((subscriptions) => {
        for (const [key, series] of Object.entries(subscriptions)) {
          const current = open.get(key);
          if (current?.series !== series) {
            open.set(key, {
              series,
              subscription: this.#engine
                .quotes(series)
                .subscribe((quotes) => subscriber.next(quotes)),
            });
            current?.subscription.unsubscribe();
          }
        }
        for (const [key, { subscription: ended }] of open) {
          if (!(key in subscriptions)) {
            ended.unsubscribe();
            open.delete(key);
          }
        }
      });
      return () => {
        subscription.unsubscribe();
        open.forEach((entry) => entry.subscription.unsubscribe());
        open.clear();
      };
    });
  }

  /** The 15-minute candles of the trading day of an overview index, once the clock is known. */
  #loadOverviewSparkline(series: number): Observable<Action> {
    return this.#store.pipe(
      select(selectTick),
      filter((tick): tick is number => tick !== null),
      take(1),
      switchMap((now) =>
        this.#engine.candles({ series, ...overviewSparklineRequest(now) }).pipe(
          map(({ candles }) => MarketActions.retrievedOverviewSparkline({ series, candles })),
          catchError((error: unknown) =>
            of(MarketActions.loadOverviewSparklineFailure({ series, error })),
          ),
        ),
      ),
    );
  }

  /** When the screener queries: at once, after filter changes, the debounced search, a new day. */
  #screenerTriggers(): Observable<unknown> {
    return merge(
      of(null),
      this.#actions$.pipe(
        ofType(
          MarketActions.selectedScreenerFilter,
          MarketActions.submittedScreenerDividendYield,
          MarketActions.clickedScreenerSort,
          MarketActions.clickedResetScreenerFilter,
        ),
      ),
      this.#actions$.pipe(
        ofType(MarketActions.enteredScreenerSearch),
        debounceTime(SCREENER_SEARCH_DEBOUNCE_MS),
      ),
      this.#store.pipe(select(selectMarketDay), distinctUntilChanged(), skip(1)),
    );
  }

  /** The instrument of the route once the master data is there. */
  #whenRouteInstrument(): Observable<Instrument> {
    return this.#store.pipe(
      select(selectRouteInstrument),
      filter((instrument): instrument is Instrument => instrument !== null),
      take(1),
    );
  }

  #whenInstrumentsLoaded(): Observable<boolean> {
    return this.#store.pipe(select(selectInstrumentsLoaded), filter(Boolean), take(1));
  }

  /** The bundling window, a pending task while it is open. */
  #window(): Observable<unknown> {
    return defer(() => {
      const done = this.#pendingTasks.add();
      return timer(QUOTES_BUNDLE_WINDOW_MS).pipe(finalize(done));
    });
  }
}

function sameChartSubscription(a: ChartSubscription, b: ChartSubscription): boolean {
  return a.interval === b.interval && a.live === b.live;
}
