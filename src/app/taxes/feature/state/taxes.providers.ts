import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { TaxesEffects } from './taxes.effects';
import { TaxesFacade } from './taxes.facade';
import * as fromTaxes from './taxes.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideTaxesState(): Array<Provider | EnvironmentProviders> {
  return [
    TaxesFacade,
    provideState(fromTaxes.TAXES_FEATURE_KEY, fromTaxes.taxesReducer),
    provideEffects(TaxesEffects),
  ];
}
