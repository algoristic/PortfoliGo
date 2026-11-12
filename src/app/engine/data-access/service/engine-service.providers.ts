import { Provider } from '@angular/core';

import { EngineService } from './engine.service';

/** Registered exactly once, in `provideAppCore()`, so there is exactly one worker (TS §11.2). */
export function provideEngineService(): Provider[] {
  return [EngineService];
}
