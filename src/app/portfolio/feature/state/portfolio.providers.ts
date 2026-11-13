import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { PortfolioEffects } from './portfolio.effects';
import { PortfolioFacade } from './portfolio.facade';
import * as fromPortfolio from './portfolio.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function providePortfolioState(): Array<Provider | EnvironmentProviders> {
  return [
    PortfolioFacade,
    provideState(fromPortfolio.PORTFOLIO_FEATURE_KEY, fromPortfolio.portfolioReducer),
    provideEffects(PortfolioEffects),
  ];
}
