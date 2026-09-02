import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { filter, map, switchMap } from 'rxjs';

import { TransactionsFacade } from './transactions.facade';

import { UsersFacade } from '../../../users/feature/state/users.facade';

export function initTransactions(): CanActivateFn {
  return () => {
    const transactionsFacade = inject(TransactionsFacade);
    const usersFacade = inject(UsersFacade);

    return usersFacade.loadedActiveUser$.pipe(
      filter((loadedActiveUser) => !!loadedActiveUser),
      switchMap(() =>
        usersFacade.activeUser$.pipe(
          filter(Boolean),
          map((user) => {
            transactionsFacade.init(user);
            return true;
          }),
        ),
      ),
    );
  };
}
