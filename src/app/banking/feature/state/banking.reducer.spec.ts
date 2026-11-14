import { AccountId } from '@app/banking/domain/models/account.model';
import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';
import { StatementEntry } from '@app/banking/domain/models/statement.model';
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
    reserved: 0,
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
    it('replaces the standing orders only with projections that carry them', () => {
      const standingOrders: StandingOrderView[] = [
        {
          id: 'so-1',
          fromAccountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: 10_000,
          day: 1,
          purpose: '',
          createdAt: 0,
          paused: false,
          handledUpTo: '2030-03',
          nextExecution: 360,
        },
      ];
      const loaded = reduce(received({ ...projection(true, [], 0), standingOrders }));
      expect(loaded.standingOrders).toEqual(standingOrders);
      const kept = bankingReducer(loaded, received(projection(false, [], 0)));
      expect(kept.standingOrders).toBe(loaded.standingOrders);
      const deleted = bankingReducer(
        kept,
        received({ ...projection(false, [], 0), standingOrders: [] }),
      );
      expect(deleted.standingOrders).toEqual([]);
      expect(reduce().standingOrders).toBeNull();
    });

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
        BankingActions.submittedStandingOrderPaused({ standingOrderId: 'so-1', paused: true }),
      );
      expect(twice.pending).toEqual({
        openAccount: 2,
        closeAccount: 0,
        setSalaryAccount: 1,
        transfer: 0,
        createStandingOrder: 0,
        changeStandingOrder: 0,
        setStandingOrderPaused: 1,
        deleteStandingOrder: 0,
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
        BankingActions.setStandingOrderPausedSuccess({
          standingOrderId: 'so-1',
          paused: true,
          tick: 1,
        }),
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

  describe('statement', () => {
    const entries = [{ seq: 2 }, { seq: 1 }] as StatementEntry[];
    const page = (generation: number): ReturnType<typeof BankingActions.retrievedStatementPage> =>
      BankingActions.retrievedStatementPage({ generation, offset: 50, total: 120, entries });

    it('starts each visit with a new query and takes only its pages', () => {
      const first = reduce(BankingActions.enterAccountStatementPage());
      const generation = first.statement.generation;
      expect(first.statement.loading).toBe(true);
      const loaded = bankingReducer(first, page(generation));
      expect(loaded.statement).toMatchObject({ total: 120, offset: 50, entries, loading: false });
      // A late reply of the previous visit changes nothing.
      const again = [
        BankingActions.leaveAccountStatementPage(),
        BankingActions.enterAccountStatementPage(),
      ].reduce(bankingReducer, loaded);
      expect(bankingReducer(again, page(generation))).toBe(again);
      expect(again.statement.total).toBeNull();
    });

    it('starts a new query from the top when the filter changes and keeps the rows until it answers', () => {
      const loaded = reduce(
        BankingActions.enterAccountStatementPage(),
        BankingActions.scrolledStatement({ range: { start: 60, end: 70 } }),
        page(1),
        BankingActions.selectedStatementTypes({ types: ['salary'] }),
        BankingActions.enteredStatementSearch({ search: 'Miete' }),
      );
      expect(loaded.statement).toMatchObject({
        filter: { period: 'all', types: ['salary'], search: 'Miete' },
        generation: 3,
        total: 120,
        entries,
        range: { start: 0, end: 10 },
        loading: true,
      });
      expect(bankingReducer(loaded, page(2))).toBe(loaded);
      const reset = bankingReducer(loaded, BankingActions.clickedResetStatementFilter());
      expect(reset.statement.filter).toEqual({ period: 'all', types: [], search: '' });
      expect(reset.statement.generation).toBe(4);
    });

    it('keeps the error of the current query only', () => {
      const error = new EngineCommandError('unknown-account');
      const state = reduce(
        BankingActions.enterAccountStatementPage(),
        BankingActions.loadStatementFailure({ generation: 0, error: new Error('old') }),
        BankingActions.loadStatementFailure({ generation: 1, error }),
      );
      expect(state.statement).toMatchObject({ error, loading: false });
      expect(bankingReducer(state, page(1)).statement.error).toBeUndefined();
    });
  });

  describe('bank comparison', () => {
    it('sorts by a feature, reverses on a second click and starts another at its default', () => {
      const sorted = reduce(BankingActions.selectedBankSort({ key: 'accountFee' }));
      expect(sorted.bankSort).toEqual({ key: 'accountFee', direction: 'ascending' });
      const reversed = bankingReducer(
        sorted,
        BankingActions.selectedBankSort({ key: 'accountFee' }),
      );
      expect(reversed.bankSort).toEqual({ key: 'accountFee', direction: 'descending' });
      const other = bankingReducer(
        reversed,
        BankingActions.selectedBankSort({ key: 'savingsRate' }),
      );
      expect(other.bankSort).toEqual({ key: 'savingsRate', direction: 'descending' });
    });
  });

  describe('monthly values', () => {
    const monthlyValues = {
      closedMonths: [],
      current: {
        month: { year: 2030, month: 4 },
        values: {
          income: 250_000,
          livingCosts: 0,
          fees: 0,
          creditInterest: 0,
          debitInterest: 0,
          taxes: 0,
          dividends: 0,
        },
      },
    };

    it('holds the monthly values only while the accounts page is open', () => {
      const loaded = reduce(
        BankingActions.enterAccountsPage(),
        BankingActions.retrievedMonthlyValues({ monthlyValues }),
      );
      expect(loaded.monthlyValues).toEqual(monthlyValues);
      expect(bankingReducer(loaded, BankingActions.leaveAccountsPage()).monthlyValues).toBeNull();
      expect(bankingReducer(loaded, BankingActions.enterAccountsPage()).monthlyValues).toBeNull();
    });
  });
});
