import { EnvironmentProviders, Provider } from '@angular/core';

import { provideBankingState } from '@app/banking/feature/state/banking.providers';
import { provideClockState } from '@app/clock/feature/state/clock.providers';
import { provideSessionState } from '@app/engine/feature/state/session.providers';
import { provideMarketState } from '@app/market/feature/state/market.providers';
import { provideNotificationsState } from '@app/notifications/feature/state/notifications.providers';
import { provideTaxesState } from '@app/taxes/feature/state/taxes.providers';
import { provideTradingState } from '@app/trading/feature/state/trading.providers';

/**
 * The slices of the game area, registered exactly once at the shell route `/game/:playerId`
 * (TS §11.2 point 4, §11.3); the `EngineService` comes from `provideAppCore()`.
 */
export function provideGameState(): Array<Provider | EnvironmentProviders> {
  return [
    provideSessionState(),
    provideClockState(),
    provideBankingState(),
    provideNotificationsState(),
    provideMarketState(),
    provideTaxesState(),
    provideTradingState(),
  ];
}
