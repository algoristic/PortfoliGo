import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as TransactionsActions from './transactions.actions';
import * as TransactionsSelectors from './transactions.selectors';

import { User } from '../../../users/domain/models/users.model';

@Injectable()
export class TransactionsFacade {
  readonly #store = inject(Store);

  balance$ = this.#store.pipe(select(TransactionsSelectors.selectBalance));
  transactions$ = this.#store.pipe(select(TransactionsSelectors.selectTransactions));
  loaded$ = this.#store.pipe(select(TransactionsSelectors.selectLoaded));

  init(user: User): void {
    this.#store.dispatch(TransactionsActions.init({ user }));
  }
}
