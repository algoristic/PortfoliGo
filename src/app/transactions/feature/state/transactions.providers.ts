import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { TransactionsEffects } from './transactions.effects';
import { TransactionsFacade } from './transactions.facade';
import * as fromTransactions from './transactions.reducer';

import { provideTransactionsService } from '../../data-access/services/transactions-service.providers';

export function provideTransactionsState(): Array<Provider | EnvironmentProviders> {
  return [
    TransactionsFacade,
    provideTransactionsService(),
    provideState(fromTransactions.TRANSACTIONS_KEY, fromTransactions.transactionsReducer),
    provideEffects(TransactionsEffects),
  ];
}
