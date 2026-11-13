import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { BankingFacade } from './banking.facade';

/** Starts the monthly overview of the accounts page (US-EK-03). */
export function enterAccountsPage(): CanActivateFn {
  return () => {
    inject(BankingFacade).enterAccountsPage();
    return true;
  };
}

export function leaveAccountsPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(BankingFacade).leaveAccountsPage();
    return true;
  };
}

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
