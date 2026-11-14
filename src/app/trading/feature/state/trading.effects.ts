import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  concat,
  filter,
  last,
  map,
  mergeMap,
  of,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';

import {
  SavingsPlansProjectionUpdate,
  TradingProjectionUpdate,
} from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectInstrumentEntities } from '@app/market/feature/state/market.selectors';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import {
  orderCommandFailureMessage,
  placeOrderShortfall,
  SavingsPlanCommand,
  savingsPlanCommandFailureMessage,
} from './trading-errors.utils';
import * as TradingActions from './trading.actions';
import { selectOrderTicketContext } from './trading.selectors';

const SAVINGS_PLAN_FAILURE_COMMANDS: Readonly<Record<string, SavingsPlanCommand>> = {
  [TradingActions.createSavingsPlanFailure.type]: 'createSavingsPlan',
  [TradingActions.changeSavingsPlanFailure.type]: 'changeSavingsPlan',
  [TradingActions.setSavingsPlanPausedFailure.type]: 'setSavingsPlanPaused',
  [TradingActions.deleteSavingsPlanFailure.type]: 'deleteSavingsPlan',
};

@Injectable()
export class TradingEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);
  readonly #store = inject(Store);
  readonly #toastService = inject(ToastService);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /**
   * Like the banking slice's `watchProjection$`: the trading part of the last full projection
   * before the reply to `loadPlayer` (earlier ones may belong to the previous player) and every
   * one after it, including the full one after a worker restart.
   */
  watchTrading$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const fullBeforeLoad$ = this.#engine.trading$.pipe(
          filter((trading) => trading.full),
          takeUntil(loaded$),
          last(undefined, null),
          filter((trading): trading is TradingProjectionUpdate => trading !== null),
        );
        return concat(fullBeforeLoad$, this.#engine.trading$).pipe(
          map((trading) => TradingActions.receivedTrading({ trading })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );

  /** Like `watchTrading$`: the savings plans of every projection that carries them (AP 5.6b). */
  watchSavingsPlans$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const fullBeforeLoad$ = this.#engine.savingsPlans$.pipe(
          filter((update) => update.full),
          takeUntil(loaded$),
          last(undefined, null),
          filter((update): update is SavingsPlansProjectionUpdate => update !== null),
        );
        return concat(fullBeforeLoad$, this.#engine.savingsPlans$).pipe(
          map((savingsPlans) => TradingActions.receivedSavingsPlans({ savingsPlans })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );

  createSavingsPlan$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedCreateSavingsPlan),
      mergeMap(({ plan }) =>
        this.#engine.createSavingsPlan(plan).pipe(
          map(({ savingsPlanId, tick }) =>
            TradingActions.createSavingsPlanSuccess({ plan, savingsPlanId, tick }),
          ),
          catchError((error: unknown) => of(TradingActions.createSavingsPlanFailure({ error }))),
        ),
      ),
    ),
  );

  changeSavingsPlan$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedChangeSavingsPlan),
      mergeMap(({ savingsPlanId, change }) =>
        this.#engine.changeSavingsPlan(savingsPlanId, change).pipe(
          map(({ tick }) => TradingActions.changeSavingsPlanSuccess({ savingsPlanId, tick })),
          catchError((error: unknown) => of(TradingActions.changeSavingsPlanFailure({ error }))),
        ),
      ),
    ),
  );

  setSavingsPlanPaused$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedSetSavingsPlanPaused),
      mergeMap(({ savingsPlanId, paused }) =>
        this.#engine.setSavingsPlanPaused(savingsPlanId, paused).pipe(
          map(({ tick }) =>
            TradingActions.setSavingsPlanPausedSuccess({ savingsPlanId, paused, tick }),
          ),
          catchError((error: unknown) => of(TradingActions.setSavingsPlanPausedFailure({ error }))),
        ),
      ),
    ),
  );

  deleteSavingsPlan$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedDeleteSavingsPlan),
      mergeMap(({ savingsPlanId }) =>
        this.#engine.deleteSavingsPlan(savingsPlanId).pipe(
          map(({ tick }) => TradingActions.deleteSavingsPlanSuccess({ savingsPlanId, tick })),
          catchError((error: unknown) => of(TradingActions.deleteSavingsPlanFailure({ error }))),
        ),
      ),
    ),
  );

  showSavingsPlanSuccess$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          TradingActions.createSavingsPlanSuccess,
          TradingActions.changeSavingsPlanSuccess,
          TradingActions.setSavingsPlanPausedSuccess,
          TradingActions.deleteSavingsPlanSuccess,
        ),
        concatLatestFrom(() => this.#store.pipe(select(selectInstrumentEntities))),
        tap(([action, instruments]) => {
          switch (action.type) {
            case TradingActions.createSavingsPlanSuccess.type: {
              const name = instruments[action.plan.instrumentId]?.name ?? action.plan.instrumentId;
              this.#toastService.success(
                $localize`:@@featureTrading-tradingEffects-createSavingsPlanSuccess:Sparplan für ${name}:instrument: angelegt.`,
              );
              break;
            }
            case TradingActions.changeSavingsPlanSuccess.type:
              this.#toastService.success(
                $localize`:@@featureTrading-tradingEffects-changeSavingsPlanSuccess:Der Sparplan ist geändert.`,
              );
              break;
            case TradingActions.setSavingsPlanPausedSuccess.type:
              this.#toastService.success(
                action.paused
                  ? $localize`:@@featureTrading-tradingEffects-pauseSavingsPlanSuccess:Der Sparplan ist pausiert.`
                  : $localize`:@@featureTrading-tradingEffects-resumeSavingsPlanSuccess:Der Sparplan läuft wieder.`,
              );
              break;
            case TradingActions.deleteSavingsPlanSuccess.type:
              this.#toastService.success(
                $localize`:@@featureTrading-tradingEffects-deleteSavingsPlanSuccess:Der Sparplan ist gelöscht.`,
              );
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  showSavingsPlanFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          TradingActions.createSavingsPlanFailure,
          TradingActions.changeSavingsPlanFailure,
          TradingActions.setSavingsPlanPausedFailure,
          TradingActions.deleteSavingsPlanFailure,
        ),
        tap((action) =>
          this.#toastService.error(
            savingsPlanCommandFailureMessage(
              SAVINGS_PLAN_FAILURE_COMMANDS[action.type],
              action.error,
            ),
          ),
        ),
      ),
    { dispatch: false },
  );

  placeOrder$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedPlaceOrder),
      mergeMap(({ order }) =>
        this.#engine.placeOrder(order).pipe(
          map(({ orderId, tick }) => TradingActions.placeOrderSuccess({ order, orderId, tick })),
          catchError((error: unknown) => of(TradingActions.placeOrderFailure({ order, error }))),
        ),
      ),
    ),
  );

  changeOrder$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedChangeOrder),
      mergeMap(({ orderId, change }) =>
        this.#engine.changeOrder(orderId, change).pipe(
          map(({ tick }) => TradingActions.changeOrderSuccess({ orderId, change, tick })),
          catchError((error: unknown) => of(TradingActions.changeOrderFailure({ orderId, error }))),
        ),
      ),
    ),
  );

  cancelOrder$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(TradingActions.submittedCancelOrder),
      mergeMap(({ orderId }) =>
        this.#engine.cancelOrder(orderId).pipe(
          map(({ tick }) => TradingActions.cancelOrderSuccess({ orderId, tick })),
          catchError((error: unknown) => of(TradingActions.cancelOrderFailure({ orderId, error }))),
        ),
      ),
    ),
  );

  /** Executions report themselves through their notification (TS §12); this confirms the order. */
  showSuccess$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          TradingActions.placeOrderSuccess,
          TradingActions.changeOrderSuccess,
          TradingActions.cancelOrderSuccess,
        ),
        concatLatestFrom(() => this.#store.pipe(select(selectInstrumentEntities))),
        tap(([action, instruments]) => {
          switch (action.type) {
            case TradingActions.placeOrderSuccess.type: {
              const name =
                instruments[action.order.instrumentId]?.name ?? action.order.instrumentId;
              this.#toastService.success(
                action.order.side === 'buy'
                  ? $localize`:@@featureTrading-tradingEffects-placeBuySuccess:Kauforder für ${name}:instrument: erteilt.`
                  : $localize`:@@featureTrading-tradingEffects-placeSellSuccess:Verkaufsorder für ${name}:instrument: erteilt.`,
              );
              break;
            }
            case TradingActions.changeOrderSuccess.type:
              this.#toastService.success(
                $localize`:@@featureTrading-tradingEffects-changeOrderSuccess:Die Order ist geändert.`,
              );
              break;
            case TradingActions.cancelOrderSuccess.type:
              this.#toastService.success(
                $localize`:@@featureTrading-tradingEffects-cancelOrderSuccess:Die Order ist storniert.`,
              );
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  /** A refused purchase names its shortfall at the current quote (US-HD-01). */
  showPlaceOrderFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(TradingActions.placeOrderFailure),
        mergeMap(({ order, error }) =>
          this.#store.pipe(
            select(selectOrderTicketContext(order.instrumentId)),
            take(1),
            map((context) =>
              orderCommandFailureMessage('placeOrder', error, placeOrderShortfall(order, context)),
            ),
          ),
        ),
        tap((message) => this.#toastService.error(message)),
      ),
    { dispatch: false },
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(TradingActions.changeOrderFailure, TradingActions.cancelOrderFailure),
        tap((action) =>
          this.#toastService.error(
            orderCommandFailureMessage(
              action.type === TradingActions.changeOrderFailure.type
                ? 'changeOrder'
                : 'cancelOrder',
              action.error,
            ),
          ),
        ),
      ),
    { dispatch: false },
  );
}
