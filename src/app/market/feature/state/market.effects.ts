import { inject, Injectable, PendingTasks } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  buffer,
  catchError,
  concat,
  connect,
  defer,
  distinctUntilChanged,
  EMPTY,
  exhaustMap,
  filter,
  finalize,
  map,
  Observable,
  of,
  Subscription,
  switchMap,
  take,
  takeUntil,
  tap,
  timer,
} from 'rxjs';

import { EngineService } from '@app/engine/data-access/service/engine.service';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as MarketActions from './market.actions';
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
import { latestQuotes } from './market.utils';

@Injectable()
export class MarketEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);
  readonly #store = inject(Store);
  readonly #toastService = inject(ToastService);
  readonly #pendingTasks = inject(PendingTasks);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
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

  /** The instrument page watches the quote of the instrument of its route, once it is known. */
  enterInstrumentPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(MarketActions.enterInstrumentPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectRouteInstrument),
          filter((instrument): instrument is Instrument => instrument !== null),
          take(1),
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
