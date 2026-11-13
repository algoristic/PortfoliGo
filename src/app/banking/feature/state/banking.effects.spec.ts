import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { firstValueFrom, of, Subject, take, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { BANK_COMMAND_ERRORS } from '@app/banking/domain/models/bank-command.model';
import { ProjectionPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { Bank } from '@app/world/domain/models/bank.model';

import { bankCommandFailureMessage } from './banking-errors.utils';
import * as BankingActions from './banking.actions';
import { BankingEffects } from './banking.effects';
import { BANK_COMMANDS } from './banking.model';

function projection(tick: number, full: boolean, netWorth: number): ProjectionPayload {
  return { tick, full, accounts: [], netWorth };
}

const TRANSFER = {
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 123_456,
  purpose: 'Miete',
} as const;

describe('BankingEffects', () => {
  let effects: BankingEffects;
  let actions$: Subject<Action>;
  let projection$: Subject<ProjectionPayload>;
  let engine: Mocked<
    Pick<
      EngineService,
      'banks' | 'openAccount' | 'closeAccount' | 'setSalaryAccount' | 'transfer' | 'projection$'
    >
  >;
  let toasts: Mocked<Pick<ToastService, 'success' | 'error'>>;

  beforeEach(() => {
    actions$ = new Subject();
    projection$ = new Subject();
    engine = {
      banks: vi.fn(),
      openAccount: vi.fn(),
      closeAccount: vi.fn(),
      setSalaryAccount: vi.fn(),
      transfer: vi.fn(),
      projection$: projection$.asObservable(),
    };
    toasts = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        BankingEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: EngineService, useValue: engine },
        { provide: ToastService, useValue: toasts },
      ],
    });
    effects = TestBed.inject(BankingEffects);
  });

  describe('watchProjection$', () => {
    it('takes the last full projection before the reply to loadPlayer and every one after it', async () => {
      const profile = { id: 'p-b' } as PlayerProfile;
      const result = firstValueFrom(effects.watchProjection$.pipe(take(3), toArray()));
      actions$.next(SessionActions.enterGame({ profile }));
      projection$.next(projection(1, false, 100));
      projection$.next(projection(2, true, 200));
      projection$.next(projection(3, true, 300));
      projection$.next(projection(4, false, 400));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-b', tick: 4 } }));
      projection$.next(projection(5, false, 500));
      projection$.next(projection(6, true, 600));
      expect(await result).toEqual([
        BankingActions.receivedProjection({ projection: projection(3, true, 300) }),
        BankingActions.receivedProjection({ projection: projection(5, false, 500) }),
        BankingActions.receivedProjection({ projection: projection(6, true, 600) }),
      ]);
    });

    it('drops the projections after the game was left', () => {
      const received: Action[] = [];
      const subscription = effects.watchProjection$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile: { id: 'p-a' } as PlayerProfile }));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } }));
      projection$.next(projection(1, false, 100));
      actions$.next(SessionActions.leaveGame());
      projection$.next(projection(2, false, 200));
      subscription.unsubscribe();
      expect(received).toEqual([
        BankingActions.receivedProjection({ projection: projection(1, false, 100) }),
      ]);
    });
  });

  describe('loadBanks$', () => {
    const loaded = SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } });

    it('loads the banks once the player is loaded', async () => {
      const banks = [{ id: 'bank-1', name: 'Hausbank' } as Bank];
      engine.banks.mockReturnValue(of({ kind: 'banks' as const, banks }));
      const result = firstValueFrom(effects.loadBanks$);
      actions$.next(loaded);
      expect(await result).toEqual(BankingActions.retrievedBanks({ banks }));
    });

    it('dispatches loadBanksFailure when the query fails', async () => {
      const error = new EngineCommandError('player-not-loaded');
      engine.banks.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadBanks$);
      actions$.next(loaded);
      expect(await result).toEqual(BankingActions.loadBanksFailure({ error }));
    });
  });

  describe('commands', () => {
    it('opens an account and passes the new account on', async () => {
      engine.openAccount.mockReturnValue(of({ tick: 7, accountId: 'acc-3', depotId: 'dep-4' }));
      const result = firstValueFrom(effects.openAccount$);
      actions$.next(BankingActions.submittedOpenAccount({ bankId: 'bank-2', kind: 'depot' }));
      expect(await result).toEqual(
        BankingActions.openAccountSuccess({
          bankId: 'bank-2',
          kind: 'depot',
          accountId: 'acc-3',
          depotId: 'dep-4',
          tick: 7,
        }),
      );
      expect(engine.openAccount).toHaveBeenCalledWith('bank-2', 'depot');
    });

    it('closes an account with or without a target for the remainder', async () => {
      engine.closeAccount.mockReturnValue(of({ tick: 9 }));
      const results = firstValueFrom(effects.closeAccount$.pipe(take(2), toArray()));
      actions$.next(BankingActions.submittedCloseAccount({ accountId: 'acc-2' }));
      actions$.next(
        BankingActions.submittedCloseAccount({ accountId: 'acc-3', targetAccountId: 'acc-1' }),
      );
      expect(await results).toEqual([
        BankingActions.closeAccountSuccess({ accountId: 'acc-2', tick: 9 }),
        BankingActions.closeAccountSuccess({
          accountId: 'acc-3',
          targetAccountId: 'acc-1',
          tick: 9,
        }),
      ]);
      expect(engine.closeAccount.mock.calls).toEqual([
        ['acc-2', undefined],
        ['acc-3', 'acc-1'],
      ]);
    });

    it('dispatches the failure with the error of the engine', async () => {
      const error = new EngineCommandError('insufficient-funds');
      engine.transfer.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.transfer$);
      actions$.next(BankingActions.submittedTransfer({ transfer: TRANSFER }));
      expect(await result).toEqual(BankingActions.transferFailure({ error }));
    });

    it('goes on after a failure', async () => {
      engine.setSalaryAccount
        .mockReturnValueOnce(throwError(() => new EngineCommandError('not-a-current-account')))
        .mockReturnValueOnce(of({ tick: 3 }));
      const results = firstValueFrom(effects.setSalaryAccount$.pipe(take(2), toArray()));
      actions$.next(BankingActions.submittedSalaryAccount({ accountId: 'acc-2' }));
      actions$.next(BankingActions.submittedSalaryAccount({ accountId: 'acc-1' }));
      expect((await results)[1]).toEqual(
        BankingActions.setSalaryAccountSuccess({ accountId: 'acc-1', tick: 3 }),
      );
    });
  });

  describe('showSuccess$', () => {
    it.each([
      [
        BankingActions.openAccountSuccess({
          bankId: 'bank-1',
          kind: 'savings',
          accountId: 'acc-2',
          depotId: null,
          tick: 1,
        }),
        'Das Tagesgeldkonto ist eröffnet.',
      ],
      [
        BankingActions.closeAccountSuccess({ accountId: 'acc-2', tick: 1 }),
        'Das Konto ist geschlossen.',
      ],
      [BankingActions.transferSuccess({ transfer: TRANSFER, tick: 1 }), '1.234,56 € überwiesen.'],
    ])('shows a toast for %s', (action, text) => {
      const subscription = effects.showSuccess$.subscribe();
      actions$.next(action);
      subscription.unsubscribe();
      // `Intl` separates amount and currency with a no-break space.
      expect(toasts.success.mock.calls[0]?.[0].replace(/\s/g, ' ')).toBe(text);
    });
  });

  describe('showFailure$', () => {
    it.each([
      [
        BankingActions.transferFailure({ error: new EngineCommandError('insufficient-funds') }),
        'Der Betrag ist höher als das, was auf dem Konto verfügbar ist.',
      ],
      [
        BankingActions.closeAccountFailure({ error: new EngineCommandError('salary-account') }),
        'Das Gehaltskonto lässt sich erst schließen, wenn du ein anderes Girokonto als Gehaltskonto gewählt hast.',
      ],
      [
        BankingActions.transferFailure({ error: new EngineCommandError('purpose-too-long') }),
        'Der Verwendungszweck darf höchstens 140 Zeichen lang sein.',
      ],
      [
        BankingActions.openAccountFailure({ error: new EngineCommandError('busy') }),
        'Das geht gerade nicht, weil die Spielzeit noch berechnet wird.',
      ],
      [
        BankingActions.setSalaryAccountFailure({ error: new EngineCommandError('storage-failed') }),
        'Der Auftrag konnte nicht gespeichert werden und wurde nicht ausgeführt.',
      ],
      [
        BankingActions.openAccountFailure({ error: new EngineCommandError('worker-failed') }),
        'Das Konto konnte nicht eröffnet werden.',
      ],
      [
        BankingActions.transferFailure({ error: new Error('unexpected') }),
        'Die Überweisung konnte nicht ausgeführt werden.',
      ],
    ])('shows the text for %s', (action, text) => {
      const subscription = effects.showFailure$.subscribe();
      actions$.next(action);
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledWith(text);
    });

    it('has its own text for every error code of the bank commands', () => {
      const fallbacks = BANK_COMMANDS.map((command) =>
        bankCommandFailureMessage(command, new EngineCommandError('internal-error')),
      );
      const texts = BANK_COMMAND_ERRORS.map((code) =>
        bankCommandFailureMessage('transfer', new EngineCommandError(code)),
      );
      expect(new Set(texts).size).toBe(BANK_COMMAND_ERRORS.length);
      expect(texts.filter((text) => fallbacks.includes(text))).toEqual([]);
    });
  });
});
