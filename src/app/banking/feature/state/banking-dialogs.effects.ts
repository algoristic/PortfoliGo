import { Dialog, DialogConfig, DialogRef } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import { catchError, exhaustMap, filter, map, Observable, of, switchMap, tap } from 'rxjs';

import { AccountId } from '@app/banking/domain/models/account.model';
import { StandingOrderFormModel } from '@app/banking/ui/models/standing-order-form.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import { selectPlayerId } from '@app/engine/feature/state/session.selectors';
import { openConfirmDialog } from '@app/shared/ui/dialog-confirm/dialog-confirm.utils';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { formatCents } from '@app/shared/util/format';

import { bankCommandFailureMessage } from './banking-errors.utils';
import * as BankingActions from './banking.actions';
import { AccountEntry } from './banking.model';
import {
  selectAccountOverview,
  selectBanks,
  selectOpenCurrentAccounts,
  selectSalaryAccount,
  selectStandingOrders,
  selectStatementAccountId,
} from './banking.selectors';
import { standingOrderPreselection } from './banking.utils';

import { DialogCloseAccountComponent } from '../dialog-close-account/dialog-close-account.component';
import {
  CloseAccountDialogData,
  CloseAccountDialogResult,
} from '../dialog-close-account/dialog-close-account.model';
import { DialogOpenAccountComponent } from '../dialog-open-account/dialog-open-account.component';
import {
  OpenAccountDialogData,
  OpenAccountDialogResult,
} from '../dialog-open-account/dialog-open-account.model';
import { DialogSalaryAccountComponent } from '../dialog-salary-account/dialog-salary-account.component';
import {
  SalaryAccountDialogData,
  SalaryAccountDialogResult,
} from '../dialog-salary-account/dialog-salary-account.model';
import { DialogStandingOrderComponent } from '../dialog-standing-order/dialog-standing-order.component';
import {
  StandingOrderDialogData,
  StandingOrderDialogResult,
} from '../dialog-standing-order/dialog-standing-order.model';
import { DialogTransferComponent } from '../dialog-transfer/dialog-transfer.component';
import { TransferDialogData, TransferDialogResult } from '../dialog-transfer/dialog-transfer.model';

const DIALOG_SIZE: Pick<DialogConfig, 'width' | 'maxWidth' | 'maxHeight'> = {
  width: '32rem',
  maxWidth: 'calc(100vw - 2rem)',
  maxHeight: 'calc(100dvh - 2rem)',
};

/**
 * The dialogs of the bank commands (AP 3.5, TS §11.6): `clickedX` opens the dialog with the state of
 * that moment, its result becomes the `submittedX` action of the slice (`BankingEffects` sends it to
 * the engine). The focus goes into the first field (`cdkFocusInitial`), Escape closes and the CDK
 * returns the focus to the button that opened the dialog.
 */
@Injectable()
export class BankingDialogEffects {
  readonly #actions$ = inject(Actions);
  readonly #dialog = inject(Dialog);
  readonly #engine = inject(EngineService);
  readonly #router = inject(Router);
  readonly #store = inject(Store);
  readonly #toastService = inject(ToastService);

  /**
   * The preselected bank: the clicked one, else the bank of the salary account, else the first; the
   * kind when the action names one.
   */
  openAccountDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedOpenAccount),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectBanks)),
        this.#store.pipe(select(selectSalaryAccount)),
      ]),
      map(([{ bankId, kind }, banks, salaryAccount]): OpenAccountDialogData | null => {
        const preselected = bankId ?? salaryAccount?.bankId ?? banks?.[0]?.id;
        if (banks === null || preselected === undefined) {
          return null;
        }
        return kind === undefined
          ? { banks, bankId: preselected }
          : { banks, bankId: preselected, kind };
      }),
      filter((data): data is OpenAccountDialogData => data !== null),
      exhaustMap((data) =>
        this.#open<OpenAccountDialogResult, OpenAccountDialogData>(DialogOpenAccountComponent, {
          data,
          ariaLabel: $localize`:@@featureBanking-bankingDialogEffects-openAccountLabel:Konto eröffnen`,
        }).pipe(
          filter((result): result is OpenAccountDialogResult => result !== undefined),
          map(({ bankId, kind }) => BankingActions.submittedOpenAccount({ bankId, kind })),
        ),
      ),
    ),
  );

  /** A transfer needs two open accounts; the source is the clicked one, else the salary account. */
  transferDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedTransfer),
      concatLatestFrom(() => this.#store.pipe(select(selectAccountOverview))),
      map(([{ fromAccountId }, { open }]) => {
        const from =
          open.find((account) => account.id === fromAccountId) ??
          open.find((account) => account.salaryAccount) ??
          open[0];
        return open.length < 2 || from === undefined
          ? null
          : { accounts: open, fromAccountId: from.id };
      }),
      filter((data): data is TransferDialogData => data !== null),
      exhaustMap((data) =>
        this.#open<TransferDialogResult, TransferDialogData>(DialogTransferComponent, {
          data,
          ariaLabel: $localize`:@@featureBanking-bankingDialogEffects-transferLabel:Überweisen`,
        }).pipe(
          filter((transfer): transfer is TransferDialogResult => transfer !== undefined),
          map((transfer) => BankingActions.submittedTransfer({ transfer })),
        ),
      ),
    ),
  );

  /**
   * A standing order needs two open accounts. The source is the clicked account, else the salary
   * account; the target the only other account, else from the salary account the first clearing
   * account (the inflow of a savings plan, E-21).
   */
  createStandingOrderDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedCreateStandingOrder),
      concatLatestFrom(() => this.#store.pipe(select(selectAccountOverview))),
      map(([{ fromAccountId }, { open }]): StandingOrderDialogData | null => {
        const initial = standingOrderPreselection(open, fromAccountId);
        return initial === null ? null : { accounts: open, mode: 'create', initial };
      }),
      filter((data): data is StandingOrderDialogData => data !== null),
      exhaustMap((data) =>
        this.#openStandingOrder(data).pipe(
          map((order) => BankingActions.submittedCreateStandingOrder({ order })),
        ),
      ),
    ),
  );

  changeStandingOrderDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedChangeStandingOrder),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectAccountOverview)),
        this.#store.pipe(select(selectStandingOrders)),
      ]),
      map(([{ standingOrderId }, { open }, orders]) => {
        const order = orders?.find((candidate) => candidate.id === standingOrderId);
        if (order === undefined) {
          return null;
        }
        const initial: StandingOrderFormModel = {
          fromAccountId: order.fromAccountId,
          toAccountId: order.toAccountId,
          amount: order.amount,
          day: String(order.day),
          purpose: order.purpose,
        };
        const data: StandingOrderDialogData = { accounts: open, mode: 'change', initial };
        return { standingOrderId, data };
      }),
      filter((change) => change !== null),
      exhaustMap(({ standingOrderId, data }) =>
        this.#openStandingOrder(data).pipe(
          map((order) => BankingActions.submittedChangeStandingOrder({ standingOrderId, order })),
        ),
      ),
    ),
  );

  deleteStandingOrderDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedDeleteStandingOrder),
      concatLatestFrom(() => this.#store.pipe(select(selectStandingOrders))),
      map(
        ([{ standingOrderId }, orders]) =>
          orders?.find((candidate) => candidate.id === standingOrderId) ?? null,
      ),
      filter((order) => order !== null),
      exhaustMap((order) => {
        const amount = formatCents(order.amount);
        return openConfirmDialog(this.#dialog, {
          heading: $localize`:@@featureBanking-bankingDialogEffects-deleteStandingOrderHeading:Dauerauftrag löschen?`,
          message: $localize`:@@featureBanking-bankingDialogEffects-deleteStandingOrderMessage:Der Dauerauftrag über ${amount}:amount: am ${order.day}:day:. jedes Monats wird gelöscht und nicht mehr ausgeführt.`,
          confirmLabel: $localize`:@@featureBanking-bankingDialogEffects-deleteStandingOrderConfirm:Löschen`,
          declineLabel: $localize`:@@featureBanking-bankingDialogEffects-deleteStandingOrderDecline:Behalten`,
          tone: 'danger',
        }).pipe(
          filter(Boolean),
          map(() => BankingActions.submittedDeleteStandingOrder({ standingOrderId: order.id })),
        );
      }),
    ),
  );

  /** The dialog shows the settlement of this moment (`closingPreview`, TS §7.4). */
  closeAccountDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedCloseAccount),
      concatLatestFrom(() => this.#store.pipe(select(selectAccountOverview))),
      map(([{ accountId }, { open }]) => {
        const account = open.find((candidate) => candidate.id === accountId);
        return account === undefined
          ? null
          : { account, targets: open.filter((candidate) => candidate.id !== accountId) };
      }),
      filter(
        (choice): choice is { account: AccountEntry; targets: AccountEntry[] } => choice !== null,
      ),
      exhaustMap(({ account, targets }) =>
        this.#engine.closingPreview(account.id).pipe(
          switchMap(({ preview }) =>
            this.#open<CloseAccountDialogResult, CloseAccountDialogData>(
              DialogCloseAccountComponent,
              {
                data: { account, preview, targets },
                ariaLabel: $localize`:@@featureBanking-bankingDialogEffects-closeAccountLabel:Konto schließen`,
              },
            ),
          ),
          filter((result): result is CloseAccountDialogResult => result !== undefined),
          map(({ targetAccountId }) =>
            BankingActions.submittedCloseAccount(
              targetAccountId === null
                ? { accountId: account.id }
                : { accountId: account.id, targetAccountId },
            ),
          ),
          catchError((error: unknown) => of(BankingActions.loadClosingPreviewFailure({ error }))),
        ),
      ),
    ),
  );

  /** Choosing the salary account it already is changes nothing, so it sends nothing. */
  salaryAccountDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.clickedSalaryAccount),
      concatLatestFrom(() => this.#store.pipe(select(selectOpenCurrentAccounts))),
      map(([{ accountId }, accounts]) => {
        const preselected =
          accounts.find((account) => account.id === accountId) ??
          accounts.find((account) => !account.salaryAccount) ??
          accounts[0];
        return preselected === undefined ? null : { accounts, accountId: preselected.id };
      }),
      filter((data): data is SalaryAccountDialogData => data !== null),
      exhaustMap((data) => {
        const salaryAccountId = data.accounts.find((account) => account.salaryAccount)?.id;
        return this.#open<SalaryAccountDialogResult, SalaryAccountDialogData>(
          DialogSalaryAccountComponent,
          {
            data,
            ariaLabel: $localize`:@@featureBanking-bankingDialogEffects-salaryAccountLabel:Gehaltskonto wechseln`,
          },
        ).pipe(
          filter(
            (chosen): chosen is AccountId => chosen !== undefined && chosen !== salaryAccountId,
          ),
          map((chosen) => BankingActions.submittedSalaryAccount({ accountId: chosen })),
        );
      }),
    ),
  );

  showClosingPreviewFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(BankingActions.loadClosingPreviewFailure),
        tap(({ error }) =>
          this.#toastService.error(bankCommandFailureMessage('closeAccount', error)),
        ),
      ),
    { dispatch: false },
  );

  /** From the bank comparison to the accounts, where the new account shows (US-BK-02). */
  showOpenedAccount$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(BankingActions.openAccountSuccess),
        concatLatestFrom(() => this.#store.pipe(select(selectPlayerId))),
        filter(([, playerId]) => playerId !== null && this.#router.url.endsWith('/banks')),
        tap(([, playerId]) => void this.#router.navigate(['/game', playerId, 'accounts'])),
      ),
    { dispatch: false },
  );

  /** The statement of a closed account has nothing more to do: back to the accounts (US-BK-03). */
  leaveClosedStatement$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(BankingActions.closeAccountSuccess),
        concatLatestFrom(() => [
          this.#store.pipe(select(selectStatementAccountId)),
          this.#store.pipe(select(selectPlayerId)),
        ]),
        filter(
          ([{ accountId }, statementAccountId, playerId]) =>
            playerId !== null && accountId === statementAccountId,
        ),
        tap(([, , playerId]) => void this.#router.navigate(['/game', playerId, 'accounts'])),
      ),
    { dispatch: false },
  );

  #openStandingOrder(data: StandingOrderDialogData): Observable<StandingOrderDialogResult> {
    return this.#open<StandingOrderDialogResult, StandingOrderDialogData>(
      DialogStandingOrderComponent,
      {
        data,
        ariaLabel:
          data.mode === 'create'
            ? $localize`:@@featureBanking-bankingDialogEffects-createStandingOrderLabel:Dauerauftrag anlegen`
            : $localize`:@@featureBanking-bankingDialogEffects-changeStandingOrderLabel:Dauerauftrag ändern`,
      },
    ).pipe(filter((order): order is StandingOrderDialogResult => order !== undefined));
  }

  #open<TResult, TData>(
    component: ComponentType<unknown>,
    config: DialogConfig<TData, DialogRef<TResult, unknown>>,
  ): Observable<TResult | undefined> {
    return this.#dialog.open<TResult, TData>(component, { ...DIALOG_SIZE, ...config }).closed;
  }
}
