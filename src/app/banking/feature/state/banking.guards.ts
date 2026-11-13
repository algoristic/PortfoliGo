import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { BankingFacade } from './banking.facade';

/** Starts the statement of the account in the URL (`selectStatementAccountId`). */
export function enterAccountStatementPage(): CanActivateFn {
  return () => {
    inject(BankingFacade).enterAccountStatementPage();
    return true;
  };
}

export function leaveAccountStatementPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(BankingFacade).leaveAccountStatementPage();
    return true;
  };
}
