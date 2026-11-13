import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { MarketFacade } from './market.facade';

/**
 * Starts the subscriptions of the markets overview (US-MK-01): movers, the quotes of the overview
 * indices and their sparklines.
 */
export function enterMarketsPage(): CanActivateFn {
  return () => {
    inject(MarketFacade).enterMarketsPage();
    return true;
  };
}

export function leaveMarketsPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(MarketFacade).leaveMarketsPage();
    return true;
  };
}

/** Starts the screener (US-MK-02): its query and the quotes of the visible rows. */
export function enterScreenerPage(): CanActivateFn {
  return () => {
    inject(MarketFacade).enterScreenerPage();
    return true;
  };
}

export function leaveScreenerPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(MarketFacade).leaveScreenerPage();
    return true;
  };
}

/** Starts the quote subscription of the instrument in the route parameter `instrumentId`. */
export function enterInstrumentPage(): CanActivateFn {
  return () => {
    inject(MarketFacade).enterInstrumentPage();
    return true;
  };
}

export function leaveInstrumentPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(MarketFacade).leaveInstrumentPage();
    return true;
  };
}
