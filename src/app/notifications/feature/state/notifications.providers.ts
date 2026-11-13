import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { AbsenceReportEffects } from './absence-report.effects';
import { NotificationsEffects } from './notifications.effects';
import { NotificationsFacade } from './notifications.facade';
import * as fromNotifications from './notifications.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideNotificationsState(): Array<Provider | EnvironmentProviders> {
  return [
    NotificationsFacade,
    provideState(
      fromNotifications.NOTIFICATIONS_FEATURE_KEY,
      fromNotifications.notificationsReducer,
    ),
    provideEffects(NotificationsEffects, AbsenceReportEffects),
  ];
}
