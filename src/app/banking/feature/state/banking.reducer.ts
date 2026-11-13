import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import { AccountView } from '@app/engine/domain/models/account-view.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { Cents } from '@app/shared/domain/models/money.model';
import { Bank } from '@app/world/domain/models/bank.model';

import * as BankingActions from './banking.actions';
import { BankCommand, PendingBankCommands } from './banking.model';

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
});

function changePending(state: BankingState, command: BankCommand, delta: 1 | -1): BankingState {
  return {
    ...state,
    pending: { ...state.pending, [command]: Math.max(0, state.pending[command] + delta) },
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
);

export function bankingReducer(state: BankingState | undefined, action: Action): BankingState {
  return reducer(state, action);
}
