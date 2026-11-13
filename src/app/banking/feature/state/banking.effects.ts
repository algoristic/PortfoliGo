import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
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

import { OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { ProjectionPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { formatCents } from '@app/shared/util/format';

import { bankCommandFailureMessage } from './banking-errors.utils';
import * as BankingActions from './banking.actions';

@Injectable()
export class BankingEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);
  readonly #toastService = inject(ToastService);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /**
   * The engine sends the full projection of a player right before its reply to `loadPlayer`
   * (TS §8.4); projections before it may still belong to the previous player. So the slice takes
   * the last full projection before the reply and every projection after it, including the full
   * one after a worker restart.
   */
  watchProjection$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const fullBeforeLoad$ = this.#engine.projection$.pipe(
          filter((projection) => projection.full),
          takeUntil(loaded$),
          last(undefined, null),
          filter((projection): projection is ProjectionPayload => projection !== null),
        );
        return concat(fullBeforeLoad$, this.#engine.projection$).pipe(
          map((projection) => BankingActions.receivedProjection({ projection })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );

  /** Banks of the world with their conditions; queries pass while catching up. */
  loadBanks$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.loadPlayerSuccess),
      switchMap(() =>
        this.#engine.banks().pipe(
          map(({ banks }) => BankingActions.retrievedBanks({ banks })),
          catchError((error: unknown) => of(BankingActions.loadBanksFailure({ error }))),
          takeUntil(this.#ended$),
        ),
      ),
    ),
  );

  openAccount$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedOpenAccount),
      mergeMap(({ bankId, kind }) =>
        this.#engine.openAccount(bankId, kind).pipe(
          map(({ accountId, depotId, tick }) =>
            BankingActions.openAccountSuccess({ bankId, kind, accountId, depotId, tick }),
          ),
          catchError((error: unknown) => of(BankingActions.openAccountFailure({ error }))),
        ),
      ),
    ),
  );

  closeAccount$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedCloseAccount),
      mergeMap(({ accountId, targetAccountId }) =>
        this.#engine.closeAccount(accountId, targetAccountId).pipe(
          map(({ tick }) =>
            BankingActions.closeAccountSuccess(
              targetAccountId === undefined
                ? { accountId, tick }
                : { accountId, targetAccountId, tick },
            ),
          ),
          catchError((error: unknown) => of(BankingActions.closeAccountFailure({ error }))),
        ),
      ),
    ),
  );

  setSalaryAccount$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedSalaryAccount),
      mergeMap(({ accountId }) =>
        this.#engine.setSalaryAccount(accountId).pipe(
          map(({ tick }) => BankingActions.setSalaryAccountSuccess({ accountId, tick })),
          catchError((error: unknown) => of(BankingActions.setSalaryAccountFailure({ error }))),
        ),
      ),
    ),
  );

  transfer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedTransfer),
      mergeMap(({ transfer }) =>
        this.#engine.transfer(transfer).pipe(
          map(({ tick }) => BankingActions.transferSuccess({ transfer, tick })),
          catchError((error: unknown) => of(BankingActions.transferFailure({ error }))),
        ),
      ),
    ),
  );

  showSuccess$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          BankingActions.openAccountSuccess,
          BankingActions.closeAccountSuccess,
          BankingActions.setSalaryAccountSuccess,
          BankingActions.transferSuccess,
        ),
        tap((action) => {
          switch (action.type) {
            case BankingActions.openAccountSuccess.type:
              this.#toastService.success(openedMessage(action.kind));
              break;
            case BankingActions.closeAccountSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-closeAccountSuccess:Das Konto ist geschlossen.`,
              );
              break;
            case BankingActions.setSalaryAccountSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-setSalaryAccountSuccess:Dein Gehalt geht ab jetzt auf das neue Gehaltskonto.`,
              );
              break;
            case BankingActions.transferSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-transferSuccess:${formatCents(action.transfer.amount)}:amount: überwiesen.`,
              );
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          BankingActions.openAccountFailure,
          BankingActions.closeAccountFailure,
          BankingActions.setSalaryAccountFailure,
          BankingActions.transferFailure,
        ),
        tap((action) => {
          switch (action.type) {
            case BankingActions.openAccountFailure.type:
              this.#toastService.error(bankCommandFailureMessage('openAccount', action.error));
              break;
            case BankingActions.closeAccountFailure.type:
              this.#toastService.error(bankCommandFailureMessage('closeAccount', action.error));
              break;
            case BankingActions.setSalaryAccountFailure.type:
              this.#toastService.error(bankCommandFailureMessage('setSalaryAccount', action.error));
              break;
            case BankingActions.transferFailure.type:
              this.#toastService.error(bankCommandFailureMessage('transfer', action.error));
              break;
          }
        }),
      ),
    { dispatch: false },
  );
}

function openedMessage(kind: OpenableAccountKind): string {
  switch (kind) {
    case 'current':
      return $localize`:@@featureBanking-bankingEffects-openCurrentSuccess:Das Girokonto ist eröffnet.`;
    case 'savings':
      return $localize`:@@featureBanking-bankingEffects-openSavingsSuccess:Das Tagesgeldkonto ist eröffnet.`;
    case 'depot':
      return $localize`:@@featureBanking-bankingEffects-openDepotSuccess:Das Depot mit Verrechnungskonto ist eröffnet.`;
  }
}
