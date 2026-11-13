import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { AccountId, AccountKind } from '@app/banking/domain/models/account.model';
import { ClosingPreview } from '@app/banking/domain/models/bank-command.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import { selectPlayerId } from '@app/engine/feature/state/session.selectors';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { Bank } from '@app/world/domain/models/bank.model';

import { BankingDialogEffects } from './banking-dialogs.effects';
import * as BankingActions from './banking.actions';
import { AccountEntry } from './banking.model';
import {
  selectAccountOverview,
  selectBanks,
  selectOpenCurrentAccounts,
  selectSalaryAccount,
  selectStatementAccountId,
} from './banking.selectors';

const HOME = { id: 'bank-home', name: 'Hausbank', type: 'branch' } as Bank;
const BROKER = { id: 'bank-broker', name: 'Broker', type: 'neo-broker' } as Bank;

function entry(id: AccountId, kind: AccountKind, salaryAccount = false): AccountEntry {
  return {
    id,
    kind,
    bankId: HOME.id,
    number: '0000000001',
    depot: null,
    openedAt: 0,
    closedAt: null,
    balance: 100_000,
    overdraftLimit: null,
    available: 100_000,
    salaryAccount,
    bank: HOME,
  };
}

const GIRO = entry('acc-1', 'current', true);
const SAVINGS = entry('acc-2', 'savings');
const SECOND_GIRO = entry('acc-3', 'current');
const PREVIEW: ClosingPreview = { bookings: [], remainder: 100_000, blockers: [] };

describe('BankingDialogEffects', () => {
  let effects: BankingDialogEffects;
  let actions$: Subject<Action>;
  let dialog: Mocked<Pick<Dialog, 'open'>>;
  let engine: Mocked<Pick<EngineService, 'closingPreview'>>;
  let toasts: Mocked<Pick<ToastService, 'error'>>;
  let router: Mocked<Pick<Router, 'navigate'>> & { url: string };
  let store: MockStore;

  /** The dialog closes with `result` (`undefined`: closed without confirming). */
  function closeWith(result: unknown): void {
    dialog.open.mockReturnValue({ closed: of(result) } as ReturnType<Dialog['open']>);
  }

  function openedData(): unknown {
    return dialog.open.mock.calls[0]?.[1]?.data;
  }

  function emitted(effect: Observable<unknown>, action: Action): unknown[] {
    const received: unknown[] = [];
    const subscription = effect.subscribe((next) => received.push(next));
    actions$.next(action);
    subscription.unsubscribe();
    return received;
  }

  beforeEach(() => {
    actions$ = new Subject();
    dialog = { open: vi.fn() };
    engine = { closingPreview: vi.fn() };
    toasts = { error: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true), url: '/game/p-1/accounts' };
    TestBed.configureTestingModule({
      providers: [
        BankingDialogEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: Dialog, useValue: dialog },
        { provide: EngineService, useValue: engine },
        { provide: ToastService, useValue: toasts },
        { provide: Router, useValue: router },
        provideMockStore({
          selectors: [
            { selector: selectBanks, value: [HOME, BROKER] },
            { selector: selectSalaryAccount, value: GIRO },
            { selector: selectAccountOverview, value: { open: [GIRO, SAVINGS], closed: [] } },
            { selector: selectOpenCurrentAccounts, value: [GIRO, SECOND_GIRO] },
            { selector: selectStatementAccountId, value: null },
            { selector: selectPlayerId, value: 'p-1' },
          ],
        }),
      ],
    });
    effects = TestBed.inject(BankingDialogEffects);
    store = TestBed.inject(MockStore);
  });

  describe('openAccountDialog$', () => {
    it('preselects the clicked bank and opens what the dialog returns', async () => {
      closeWith({ bankId: BROKER.id, kind: 'depot' });
      const result = firstValueFrom(effects.openAccountDialog$);
      actions$.next(BankingActions.clickedOpenAccount({ bankId: BROKER.id }));
      expect(await result).toEqual(
        BankingActions.submittedOpenAccount({ bankId: BROKER.id, kind: 'depot' }),
      );
      expect(openedData()).toEqual({ banks: [HOME, BROKER], bankId: BROKER.id });
    });

    it('preselects the bank of the salary account and sends nothing when declined', () => {
      closeWith(undefined);
      expect(emitted(effects.openAccountDialog$, BankingActions.clickedOpenAccount({}))).toEqual(
        [],
      );
      expect(openedData()).toEqual({ banks: [HOME, BROKER], bankId: HOME.id });
    });

    it('opens nothing while the banks are not loaded', () => {
      store.overrideSelector(selectBanks, null);
      store.refreshState();
      emitted(effects.openAccountDialog$, BankingActions.clickedOpenAccount({}));
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('transferDialog$', () => {
    const transfer = {
      fromAccountId: 'acc-2',
      toAccountId: 'acc-1',
      amount: 5_000,
      purpose: 'Rückbuchung',
    } as const;

    it('starts from the clicked account and sends the transfer', async () => {
      closeWith(transfer);
      const result = firstValueFrom(effects.transferDialog$);
      actions$.next(BankingActions.clickedTransfer({ fromAccountId: 'acc-2' }));
      expect(await result).toEqual(BankingActions.submittedTransfer({ transfer }));
      expect(openedData()).toEqual({ accounts: [GIRO, SAVINGS], fromAccountId: 'acc-2' });
    });

    it('starts from the salary account without a clicked one', () => {
      closeWith(undefined);
      emitted(effects.transferDialog$, BankingActions.clickedTransfer({}));
      expect(openedData()).toEqual({ accounts: [GIRO, SAVINGS], fromAccountId: 'acc-1' });
    });

    it('opens nothing with a single open account', () => {
      store.overrideSelector(selectAccountOverview, { open: [GIRO], closed: [] });
      store.refreshState();
      emitted(effects.transferDialog$, BankingActions.clickedTransfer({}));
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('closeAccountDialog$', () => {
    it('shows the closing preview and closes with the chosen target', async () => {
      engine.closingPreview.mockReturnValue(of({ kind: 'closingPreview', preview: PREVIEW }));
      closeWith({ targetAccountId: 'acc-1' });
      const result = firstValueFrom(effects.closeAccountDialog$);
      actions$.next(BankingActions.clickedCloseAccount({ accountId: 'acc-2' }));
      expect(await result).toEqual(
        BankingActions.submittedCloseAccount({ accountId: 'acc-2', targetAccountId: 'acc-1' }),
      );
      expect(engine.closingPreview).toHaveBeenCalledWith('acc-2');
      expect(openedData()).toEqual({ account: SAVINGS, preview: PREVIEW, targets: [GIRO] });
    });

    it('closes without a target when nothing remains', async () => {
      engine.closingPreview.mockReturnValue(
        of({ kind: 'closingPreview', preview: { ...PREVIEW, remainder: 0 } }),
      );
      closeWith({ targetAccountId: null });
      const result = firstValueFrom(effects.closeAccountDialog$);
      actions$.next(BankingActions.clickedCloseAccount({ accountId: 'acc-2' }));
      expect(await result).toEqual(BankingActions.submittedCloseAccount({ accountId: 'acc-2' }));
    });

    it('dispatches the failure of the preview and opens no dialog', async () => {
      const error = new EngineCommandError('busy');
      engine.closingPreview.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.closeAccountDialog$);
      actions$.next(BankingActions.clickedCloseAccount({ accountId: 'acc-2' }));
      expect(await result).toEqual(BankingActions.loadClosingPreviewFailure({ error }));
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('ignores an account that is not open', () => {
      emitted(
        effects.closeAccountDialog$,
        BankingActions.clickedCloseAccount({ accountId: 'acc-9' }),
      );
      expect(engine.closingPreview).not.toHaveBeenCalled();
    });
  });

  describe('salaryAccountDialog$', () => {
    it('preselects the clicked account and sends the chosen one', async () => {
      closeWith('acc-3');
      const result = firstValueFrom(effects.salaryAccountDialog$);
      actions$.next(BankingActions.clickedSalaryAccount({ accountId: 'acc-3' }));
      expect(await result).toEqual(BankingActions.submittedSalaryAccount({ accountId: 'acc-3' }));
      expect(openedData()).toEqual({ accounts: [GIRO, SECOND_GIRO], accountId: 'acc-3' });
    });

    it('sends nothing when the salary account stays the same', () => {
      closeWith('acc-1');
      expect(
        emitted(effects.salaryAccountDialog$, BankingActions.clickedSalaryAccount({})),
      ).toEqual([]);
      // Without a clicked account the first one that is not the salary account is preselected.
      expect(openedData()).toEqual({ accounts: [GIRO, SECOND_GIRO], accountId: 'acc-3' });
    });
  });

  describe('navigation', () => {
    const opened = BankingActions.openAccountSuccess({
      bankId: BROKER.id,
      kind: 'depot',
      accountId: 'acc-4',
      depotId: 'dep-3',
      tick: 1,
    });

    it('shows the accounts after opening an account in the bank comparison', () => {
      router.url = '/game/p-1/banks';
      emitted(effects.showOpenedAccount$, opened);
      expect(router.navigate).toHaveBeenCalledWith(['/game', 'p-1', 'accounts']);
    });

    it('stays on the accounts page after opening an account there', () => {
      emitted(effects.showOpenedAccount$, opened);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('leaves the statement of the account that was closed, and only that one', () => {
      const closed = BankingActions.closeAccountSuccess({ accountId: 'acc-2', tick: 1 });
      store.overrideSelector(selectStatementAccountId, 'acc-3');
      store.refreshState();
      emitted(effects.leaveClosedStatement$, closed);
      expect(router.navigate).not.toHaveBeenCalled();

      store.overrideSelector(selectStatementAccountId, 'acc-2');
      store.refreshState();
      emitted(effects.leaveClosedStatement$, closed);
      expect(router.navigate).toHaveBeenCalledWith(['/game', 'p-1', 'accounts']);
    });
  });

  describe('showClosingPreviewFailure$', () => {
    it('explains the code of the engine', () => {
      const subscription = effects.showClosingPreviewFailure$.subscribe();
      actions$.next(
        BankingActions.loadClosingPreviewFailure({ error: new EngineCommandError('busy') }),
      );
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledWith(
        'Das geht gerade nicht, weil die Spielzeit noch berechnet wird.',
      );
    });
  });
});
