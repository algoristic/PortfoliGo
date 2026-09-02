import { createAction, props } from '@ngrx/store';

import { User } from '../../../users/domain/models/users.model';
import { Transaction } from '../../domain/models/transactions.model';

export const init = createAction('[Transactions] Init transactions state', props<{ user: User }>());
export const loadedTransactionsHistory = createAction(
  '[Transactions] Loaded transactions history',
  props<{ transactions: Transaction[] }>(),
);
export const depositInitialCapital = createAction(
  '[Transactions] Deposit initial capital',
  props<{ user: User; amount: number }>(),
);
export const executedTransaction = createAction(
  '[Transactions] Executed transaction',
  props<{ transaction: Transaction }>(),
);
