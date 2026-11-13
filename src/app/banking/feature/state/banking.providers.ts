import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { BankingDialogEffects } from './banking-dialogs.effects';
import { BankingEffects } from './banking.effects';
import { BankingFacade } from './banking.facade';
import * as fromBanking from './banking.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideBankingState(): Array<Provider | EnvironmentProviders> {
  return [
    BankingFacade,
    provideState(fromBanking.BANKING_FEATURE_KEY, fromBanking.bankingReducer),
    provideEffects(BankingEffects, BankingDialogEffects),
  ];
}
