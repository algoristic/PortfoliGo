import { AccountId } from '@app/banking/domain/models/account.model';
import { ProjectionPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as BankingActions from './banking.actions';
import { bankingReducer, BankingState, initialBankingState } from './banking.reducer';

function account(id: AccountId, balance: number, closedAt: number | null = null): AccountView {
  return {
    id,
    kind: 'current',
    bankId: 'bank-1',
    number: '0000000001',
    depot: null,
    openedAt: 0,
    closedAt,
    balance,
    overdraftLimit: 0,
    available: balance,
    salaryAccount: false,
  };
}

function projection(full: boolean, accounts: AccountView[], netWorth: number): ProjectionPayload {
  return { tick: 1, full, accounts, netWorth };
}

function reduce(...actions: Parameters<typeof bankingReducer>[1][]): BankingState {
  return actions.reduce<BankingState>(
    (state, action) => bankingReducer(state, action),
    initialBankingState,
  );
}

function balances(state: BankingState): [string, number][] {
  return state.ids.map((id) => [String(id), state.entities[id]?.balance ?? NaN]);
}

const received = (
  payload: ProjectionPayload,
): ReturnType<typeof BankingActions.receivedProjection> =>
  BankingActions.receivedProjection({ projection: payload });

describe('bankingReducer', () => {
  describe('receivedProjection', () => {
    it('replaces all accounts with a full projection and updates only the changed ones with a delta', () => {
      const state = reduce(
        received(projection(true, [account('acc-1', 100), account('acc-2', 200)], 300)),
        received(projection(false, [account('acc-2', 50), account('acc-3', 10)], 160)),
      );
      expect(balances(state)).toEqual([
        ['acc-1', 100],
        ['acc-2', 50],
        ['acc-3', 10],
      ]);
      expect(state.netWorth).toBe(160);

      // After a worker restart the full projection drops what the engine no longer has.
      const restarted = bankingReducer(
        state,
        received(projection(true, [account('acc-1', 90)], 90)),
      );
      expect(balances(restarted)).toEqual([['acc-1', 90]]);
      expect(restarted.netWorth).toBe(90);
    });

    it('keeps closed accounts as entities', () => {
      const state = reduce(
        received(projection(true, [account('acc-1', 100), account('acc-2', 200)], 300)),
        received(projection(false, [account('acc-2', 0, 7)], 100)),
      );
      expect(state.entities['acc-2']?.closedAt).toBe(7);
    });
  });

  describe('enterGame and leaveGame', () => {
    it('drops the accounts, banks, net worth and pending commands of the previous player', () => {
      const filled = reduce(
        received(projection(true, [account('acc-1', 100)], 100)),
        BankingActions.retrievedBanks({ banks: [] }),
        BankingActions.submittedTransfer({
          transfer: { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 1, purpose: '' },
        }),
      );
      const profile = { id: 'p-b' } as PlayerProfile;
      expect(bankingReducer(filled, SessionActions.enterGame({ profile }))).toEqual(
        initialBankingState,
      );
      expect(bankingReducer(filled, SessionActions.leaveGame())).toEqual(initialBankingState);
    });
  });

  describe('pending commands', () => {
    it('counts the commands per kind until each is answered', () => {
      const open = BankingActions.submittedOpenAccount({ bankId: 'bank-1', kind: 'savings' });
      const twice = reduce(
        open,
        open,
        BankingActions.submittedSalaryAccount({ accountId: 'acc-1' }),
      );
      expect(twice.pending).toEqual({
        openAccount: 2,
        closeAccount: 0,
        setSalaryAccount: 1,
        transfer: 0,
      });

      const error = new EngineCommandError('unknown-bank');
      const answered = [
        BankingActions.openAccountSuccess({
          bankId: 'bank-1',
          kind: 'savings',
          accountId: 'acc-2',
          depotId: null,
          tick: 1,
        }),
        BankingActions.openAccountFailure({ error }),
        BankingActions.setSalaryAccountSuccess({ accountId: 'acc-1', tick: 1 }),
      ].reduce(bankingReducer, twice);
      expect(answered.pending).toEqual(initialBankingState.pending);
      expect(answered.error).toBe(error);
    });

    it('does not count below zero when a reply arrives after the player changed', () => {
      const state = reduce(
        BankingActions.submittedTransfer({
          transfer: { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 1, purpose: '' },
        }),
        SessionActions.leaveGame(),
        BankingActions.transferFailure({ error: new EngineCommandError('busy') }),
      );
      expect(state.pending.transfer).toBe(0);
    });
  });
});
