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

/**
 * Starts the daily series of the net worth chart (AP 5.7, US-PF-04) for the page that shows it
 * (the dashboard, AP 5.7b): loaded for the selected period and again after every day end.
 */
export function enterPerformanceHistory(): CanActivateFn {
  return () => {
    inject(PortfolioFacade).enterPerformanceHistory();
    return true;
  };
}

export function leavePerformanceHistory(): CanDeactivateFn<unknown> {
  return () => {
    inject(PortfolioFacade).leavePerformanceHistory();
    return true;
  };
}

/**
 * Starts the trades of the position detail (US-PF-06): order executions and savings plan purchases
 * from the journal, loaded again when the holdings of the instrument change.
 */
export function enterPositionPage(): CanActivateFn {
  return () => {
    inject(PortfolioFacade).enterPositionPage();
    return true;
  };
}

export function leavePositionPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(PortfolioFacade).leavePositionPage();
    return true;
  };
}
