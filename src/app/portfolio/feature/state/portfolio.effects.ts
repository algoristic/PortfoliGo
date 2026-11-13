import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  distinctUntilChanged,
  filter,
  from,
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
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentsLoaded } from '@app/market/feature/state/market.selectors';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PortfolioActions from './portfolio.actions';
import { PORTFOLIO_SUBSCRIPTION } from './portfolio.model';
import { selectMissingCompositions, selectPortfolioSeries } from './portfolio.selectors';

@Injectable()
export class PortfolioEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #engine = inject(EngineService);
  readonly #toastService = inject(ToastService);

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
