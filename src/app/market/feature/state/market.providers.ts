import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { MarketEffects } from './market.effects';
import { MarketFacade } from './market.facade';
import * as fromMarket from './market.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideMarketState(): Array<Provider | EnvironmentProviders> {
  return [
    MarketFacade,
    provideState(fromMarket.MARKET_FEATURE_KEY, fromMarket.marketReducer),
    provideEffects(MarketEffects),
  ];
}
