import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import { AccountView } from '@app/engine/domain/models/account-view.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { Cents } from '@app/shared/domain/models/money.model';
import { Bank } from '@app/world/domain/models/bank.model';

import * as BankingActions from './banking.actions';
import {
  BankCommand,
  PendingBankCommands,
  StatementFilterState,
  StatementState,
} from './banking.model';
import { DEFAULT_STATEMENT_FILTER, initialStatementState } from './banking.utils';

export const BANKING_FEATURE_KEY = 'banking';

/**
 * Accounts of the loaded player from the `projection` event (TS §8.4), closed ones included; in
 * the order of the engine (account order).
 */
export interface BankingState extends EntityState<AccountView> {
  /** Banks of the world with their conditions; `null` until loaded. */
  banks: Bank[] | null;
  /** Net worth of the last projection; `null` until the first. */
  netWorth: Cents | null;
  pending: PendingBankCommands;
  /** The statement page that is open (TS §11.3); only its loaded window. */
  statement: StatementState;
  error?: unknown;
}

export const accountsAdapter: EntityAdapter<AccountView> = createEntityAdapter<AccountView>();

const noPendingCommands: PendingBankCommands = {
  openAccount: 0,
  closeAccount: 0,
  setSalaryAccount: 0,
  transfer: 0,
};

export const initialBankingState: BankingState = accountsAdapter.getInitialState({
  banks: null,
  netWorth: null,
  pending: noPendingCommands,
  statement: initialStatementState,
});

function changePending(state: BankingState, command: BankCommand, delta: 1 | -1): BankingState {
  return {
    ...state,
    pending: { ...state.pending, [command]: Math.max(0, state.pending[command] + delta) },
  };
}

/**
 * A new query of the statement from the top (the list scrolls up): replies of older queries are
 * dropped, the rows shown so far stay until the first rows of the new one arrive.
 */
function newStatementQuery(state: BankingState, filter: StatementFilterState): BankingState {
  const statement = state.statement;
  return {
    ...state,
    statement: {
      ...statement,
      filter,
      generation: statement.generation + 1,
      range: { start: 0, end: statement.range.end - statement.range.start },
      loading: true,
    },
  };
}

const reducer = createReducer(
  initialBankingState,
  // Nothing of the previous player stays when another one is entered or the game is left.
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialBankingState),
  on(BankingActions.receivedProjection, (state, { projection }) =>
    projection.full
      ? accountsAdapter.setAll(projection.accounts, { ...state, netWorth: projection.netWorth })
      : accountsAdapter.upsertMany(projection.accounts, {
          ...state,
          netWorth: projection.netWorth,
        }),
  ),
  on(BankingActions.retrievedBanks, (state, { banks }) => ({ ...state, banks })),
  on(BankingActions.loadBanksFailure, (state, { error }) => ({ ...state, error })),
  on(BankingActions.submittedOpenAccount, (state) => changePending(state, 'openAccount', 1)),
  on(BankingActions.submittedCloseAccount, (state) => changePending(state, 'closeAccount', 1)),
  on(BankingActions.submittedSalaryAccount, (state) => changePending(state, 'setSalaryAccount', 1)),
  on(BankingActions.submittedTransfer, (state) => changePending(state, 'transfer', 1)),
  on(BankingActions.openAccountSuccess, (state) => changePending(state, 'openAccount', -1)),
  on(BankingActions.closeAccountSuccess, (state) => changePending(state, 'closeAccount', -1)),
  on(BankingActions.setSalaryAccountSuccess, (state) =>
    changePending(state, 'setSalaryAccount', -1),
  ),
  on(BankingActions.transferSuccess, (state) => changePending(state, 'transfer', -1)),
  on(BankingActions.openAccountFailure, (state, { error }) => ({
    ...changePending(state, 'openAccount', -1),
    error,
  })),
  on(BankingActions.closeAccountFailure, (state, { error }) => ({
    ...changePending(state, 'closeAccount', -1),
    error,
  })),
  on(BankingActions.setSalaryAccountFailure, (state, { error }) => ({
    ...changePending(state, 'setSalaryAccount', -1),
    error,
  })),
  on(BankingActions.transferFailure, (state, { error }) => ({
    ...changePending(state, 'transfer', -1),
    error,
  })),
  on(BankingActions.enterAccountStatementPage, (state) => ({
    ...state,
    statement: {
      ...initialStatementState,
      generation: state.statement.generation + 1,
      loading: true,
    },
  })),
  on(BankingActions.leaveAccountStatementPage, (state) => ({
    ...state,
    statement: { ...initialStatementState, generation: state.statement.generation + 1 },
  })),
  on(BankingActions.selectedStatementPeriod, (state, { period }) =>
    newStatementQuery(state, { ...state.statement.filter, period }),
  ),
  on(BankingActions.selectedStatementTypes, (state, { types }) =>
    newStatementQuery(state, { ...state.statement.filter, types }),
  ),
  on(BankingActions.enteredStatementSearch, (state, { search }) =>
    newStatementQuery(state, { ...state.statement.filter, search }),
  ),
  on(BankingActions.clickedResetStatementFilter, (state) =>
    newStatementQuery(state, DEFAULT_STATEMENT_FILTER),
  ),
  on(BankingActions.scrolledStatement, (state, { range }) => ({
    ...state,
    statement: { ...state.statement, range },
  })),
  on(BankingActions.retrievedStatementPage, (state, { generation, offset, total, entries }) =>
    generation === state.statement.generation
      ? {
          ...state,
          statement: {
            ...state.statement,
            total,
            offset,
            entries,
            loading: false,
            error: undefined,
          },
        }
      : state,
  ),
  on(BankingActions.loadStatementFailure, (state, { generation, error }) =>
    generation === state.statement.generation
      ? { ...state, statement: { ...state.statement, loading: false, error } }
      : state,
  ),
);

export function bankingReducer(state: BankingState | undefined, action: Action): BankingState {
  return reducer(state, action);
}
