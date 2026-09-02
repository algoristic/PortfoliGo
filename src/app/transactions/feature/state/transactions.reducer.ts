import { createEntityAdapter, EntityState } from '@ngrx/entity';

import { Action, createReducer, on } from '@ngrx/store';

import * as TransactionsInteractions from './transactions.actions';

import { Transaction } from '../../domain/models/transactions.model';

export const TRANSACTIONS_KEY = 'transactions' as const;

export interface TransactionsState extends EntityState<Transaction> {
  loaded: boolean;
}

export const transactionsAdapter = createEntityAdapter<Transaction>({
  selectId: (tx) => tx.id,
});

const initialState: TransactionsState = transactionsAdapter.getInitialState({
  loaded: false,
});

const reducer = createReducer(
  initialState,
  on(TransactionsInteractions.init, () => initialState),
  on(TransactionsInteractions.loadedTransactionsHistory, (state, { transactions }) =>
    transactionsAdapter.setAll(transactions, {
      ...state,
      loaded: true,
    }),
  ),
  on(TransactionsInteractions.executedTransaction, (state, { transaction }) =>
    transactionsAdapter.addOne(transaction, {
      ...state,
    }),
  ),
);

export function transactionsReducer(
  state: TransactionsState | undefined,
  action: Action,
): TransactionsState {
  return reducer(state, action);
}
