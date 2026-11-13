import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { PortfolioFacade } from './portfolio.facade';

/**
 * Starts the depot page (US-PF-02, US-PF-03): the quotes of all held instruments, following the
 * holdings, and the compositions of held ETFs for the look-through.
 */
export function enterPortfolioPage(): CanActivateFn {
  return () => {
    inject(PortfolioFacade).enterPortfolioPage();
    return true;
  };
}

export function leavePortfolioPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(PortfolioFacade).leavePortfolioPage();
    return true;
  };
}
