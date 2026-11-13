import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { TradingDialogEffects } from './trading-dialogs.effects';
import { TradingEffects } from './trading.effects';
import { TradingFacade } from './trading.facade';
import * as fromTrading from './trading.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideTradingState(): Array<Provider | EnvironmentProviders> {
  return [
    TradingFacade,
    provideState(fromTrading.TRADING_FEATURE_KEY, fromTrading.tradingReducer),
    provideEffects(TradingEffects, TradingDialogEffects),
  ];
}
