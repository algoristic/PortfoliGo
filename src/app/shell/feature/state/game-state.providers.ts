import { EnvironmentProviders, Provider } from '@angular/core';

import { provideClockState } from '@app/clock/feature/state/clock.providers';
import { provideSessionState } from '@app/engine/feature/state/session.providers';

/**
 * The slices of the game area, registered exactly once at the shell route `/game/:playerId`
 * (TS §11.2 point 4, §11.3); the `EngineService` comes from `provideAppCore()`.
 */
export function provideGameState(): Array<Provider | EnvironmentProviders> {
  return [provideSessionState(), provideClockState()];
}
