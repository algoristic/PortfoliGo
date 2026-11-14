import { InjectionToken, signal, Signal } from '@angular/core';

/**
 * Whether changed prices flash in the whole app (PS US-MK-05). The root default is "on";
 * `provideAppCore()` provides the device setting (AP 6.2). The input `enabled` of the directive
 * can switch it off further.
 */
export const VALUE_FLASH_ENABLED = new InjectionToken<Signal<boolean>>('VALUE_FLASH_ENABLED', {
  providedIn: 'root',
  factory: () => signal(true).asReadonly(),
});
