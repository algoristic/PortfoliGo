import { createFeatureSelector, createSelector } from '@ngrx/store';

import { TRANSACTIONS_KEY, transactionsAdapter, TransactionsState } from './transactions.reducer';

const selectState = createFeatureSelector<TransactionsState>(TRANSACTIONS_KEY);
const { selectAll } = transactionsAdapter.getSelectors();

export const selectBalance = createSelector(selectState, (state) =>
  selectAll(state).reduce((sum, tx) => sum + tx.amount, 0),
);
export const selectTransactions = createSelector(selectState, (state) => selectAll(state));
export const selectLoaded = createSelector(selectState, (state) => state.loaded);
