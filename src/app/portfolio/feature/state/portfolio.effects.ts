import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  combineLatest,
  concat,
  distinctUntilChanged,
  filter,
  from,
  last,
  map,
  mergeMap,
  of,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { selectTick } from '@app/clock/feature/state/clock.selectors';
import { PerformanceProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase } from '@app/engine/feature/state/session.selectors';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentsLoaded } from '@app/market/feature/state/market.selectors';
import { historyFromDay } from '@app/portfolio/domain/performance-logic';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PortfolioActions from './portfolio.actions';
import { PORTFOLIO_SUBSCRIPTION } from './portfolio.model';
import {
  selectHistoryRange,
  selectMissingCompositions,
  selectPerformanceDay,
  selectPortfolioSeries,
  selectPositionTradesLoad,
} from './portfolio.selectors';

@Injectable()
export class PortfolioEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #engine = inject(EngineService);
  readonly #toastService = inject(ToastService);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /**
   * Like the banking slice's `watchProjection$`: the figures of the last full projection before
   * the reply to `loadPlayer` (earlier ones may belong to the previous player) and of every
   * projection after it (AP 5.7).
   */
  watchPerformance$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const fullBeforeLoad$ = this.#engine.performance$.pipe(
          filter((update) => update.full),
          takeUntil(loaded$),
          last(undefined, null),
          filter((update): update is PerformanceProjectionUpdate => update !== null),
        );
        return concat(fullBeforeLoad$, this.#engine.performance$).pipe(
          map(({ figures }) => PortfolioActions.receivedPerformance({ figures })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );

  /**
   * While a page shows the net worth chart (US-PF-04), loads the daily series of the selected
   * period on entering, on a new period and after every day end; a newer request cancels an older
   * one.
   */
  loadPerformanceHistory$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.enterPerformanceHistory),
      switchMap(() =>
        combineLatest([
          this.#store.pipe(select(selectHistoryRange)),
          this.#store.pipe(
            select(selectPerformanceDay),
            filter((day) => day !== null),
            distinctUntilChanged(),
          ),
        ]).pipe(
          switchMap(([range, day]) => {
            const fromDay = historyFromDay(range, day);
            return this.#engine.performanceHistory(fromDay === null ? {} : { fromDay }).pipe(
              map((history) => PortfolioActions.retrievedPerformanceHistory({ range, history })),
              catchError((error: unknown) =>
                of(PortfolioActions.loadPerformanceHistoryFailure({ range, error })),
              ),
            );
          }),
          takeUntil(this.#actions$.pipe(ofType(PortfolioActions.leavePerformanceHistory))),
        ),
      ),
    ),
  );

  /**
   * While the position detail is open (US-PF-06), loads its trades from the journal once the player
   * is loaded, again for another instrument or depot and whenever the shown holdings of the
   * instrument change (an execution or savings plan purchase); a newer load cancels an older one.
   */
  loadPositionTrades$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.enterPositionPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectPhase),
          filter((phase) => phase === 'loaded'),
          take(1),
          switchMap(() => this.#store.pipe(select(selectPositionTradesLoad))),
          filter((load) => load !== null),
          distinctUntilChanged((a, b) => a.key === b.key),
          switchMap(({ instrumentId, depotId }) =>
            this.#engine
              .positionTrades(depotId === null ? { instrumentId } : { instrumentId, depotId })
              .pipe(
                map(({ trades, total }) =>
                  PortfolioActions.retrievedPositionTrades({
                    trades: { instrumentId, depotId, trades, total },
                  }),
                ),
                catchError((error: unknown) =>
                  of(PortfolioActions.loadPositionTradesFailure({ error })),
                ),
              ),
          ),
          takeUntil(this.#actions$.pipe(ofType(PortfolioActions.leavePositionPage))),
        ),
      ),
    ),
  );

  showPositionTradesFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PortfolioActions.loadPositionTradesFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featurePortfolio-portfolioEffects-loadPositionTradesFailure:Die Käufe und Verkäufe ließen sich nicht laden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showPerformanceHistoryFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PortfolioActions.loadPerformanceHistoryFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featurePortfolio-portfolioEffects-loadPerformanceHistoryFailure:Der Vermögensverlauf ließ sich nicht laden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /**
   * The depot page watches the quotes of every instrument held in an open depot once the master
   * data is there, and follows purchases and sales.
   */
  watchPortfolioQuotes$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.enterPortfolioPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectInstrumentsLoaded),
          filter(Boolean),
          take(1),
          switchMap(() => this.#store.pipe(select(selectPortfolioSeries))),
          distinctUntilChanged((a, b) => a.join() === b.join()),
          map((series) =>
            MarketActions.quotesSubscriptionChanged({ key: PORTFOLIO_SUBSCRIPTION, series }),
          ),
          takeUntil(this.#actions$.pipe(ofType(PortfolioActions.leavePortfolioPage))),
        ),
      ),
    ),
  );

  leavePortfolioPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.leavePortfolioPage),
      map(() => MarketActions.quotesSubscriptionEnded({ key: PORTFOLIO_SUBSCRIPTION })),
    ),
  );

  /**
   * While the page is open, asks for the compositions of held ETFs that are missing for the
   * current market day (look-through, E-28): on entering, after a purchase of another ETF and on a
   * new market day. The engine caches them per market day; the first ETF query costs ~0.2–0.4 s.
   */
  requestCompositions$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.enterPortfolioPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectInstrumentsLoaded),
          filter(Boolean),
          switchMap(() => this.#store.pipe(select(selectTick))),
          filter((tick) => tick !== null),
          take(1),
          switchMap(() => this.#store.pipe(select(selectMissingCompositions))),
          filter(({ ids }) => ids.length > 0),
          map(({ day, ids }) => PortfolioActions.requestedCompositions({ day, ids })),
          takeUntil(this.#actions$.pipe(ofType(PortfolioActions.leavePortfolioPage))),
        ),
      ),
    ),
  );

  loadCompositions$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.requestedCompositions),
      mergeMap(({ day, ids }) =>
        from(ids).pipe(
          mergeMap((instrumentId) =>
            this.#engine.instrumentComposition(instrumentId).pipe(
              map(({ composition }) =>
                PortfolioActions.retrievedComposition({ day, instrumentId, composition }),
              ),
              catchError((error: unknown) =>
                of(PortfolioActions.loadCompositionFailure({ day, instrumentId, error })),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  showCompositionFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PortfolioActions.loadCompositionFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featurePortfolio-portfolioEffects-loadCompositionFailure:Die Zusammensetzung eines ETF ließ sich nicht laden. Sein Wert erscheint bei Region und Sektor als „Nicht zugeordnet“.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  openDepot$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PortfolioActions.clickedOpenDepot),
      map(() => BankingActions.clickedOpenAccount({ kind: 'depot' })),
    ),
  );
}
