import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { MarketFacade } from './market.facade';

/** Starts the subscriptions of the markets page (US-MK-01): movers and overview indices. */
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
