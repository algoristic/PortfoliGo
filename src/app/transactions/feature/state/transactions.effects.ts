import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';

import { map, switchMap } from 'rxjs';

import * as TransactionsActions from './transactions.actions';
import { convertInitialCapitalDeposit } from './transactions.utils';

import { TransactionsService } from '../../data-access/services/transactions.service';

@Injectable()
export class TransactionsEffects {
  actions$ = inject(Actions);
  service = inject(TransactionsService);

  loadTransactionsHistory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TransactionsActions.init),
      switchMap(({ user }) =>
        this.service
          .getTransActionsForUser(user)
          .pipe(
            map((transactions) => TransactionsActions.loadedTransactionsHistory({ transactions })),
          ),
      ),
    ),
  );

  depositInitialCapital$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TransactionsActions.depositInitialCapital),
      map(({ user, amount }) => convertInitialCapitalDeposit(user, amount)),
      switchMap((transaction) =>
        this.service
          .executeTransaction(transaction)
          .pipe(map((transaction) => TransactionsActions.executedTransaction({ transaction }))),
      ),
    ),
  );
}
