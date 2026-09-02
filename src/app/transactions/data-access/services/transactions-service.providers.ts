import { EnvironmentProviders, Provider } from '@angular/core';

import { TransactionsService } from './transactions.service';

import { IdbStorage } from '../../../idb/data-access/service/idb.config';

export function provideTransactionsService(): Array<Provider | EnvironmentProviders> {
  return [TransactionsService];
}

export const transactionsUserIndex = 'userId' as const;
export const transactionsStorage: IdbStorage = {
  name: 'transactions',
  indexes: [transactionsUserIndex],
};
