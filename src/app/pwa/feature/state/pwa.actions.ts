import { createAction, props } from '@ngrx/store';

import { NotificationPermissionState } from '@app/notifications/domain/models/browser-notification.model';
import {
  AppUpdateEvent,
  InstallOutcome,
  PlatformInfo,
  StorageStatus,
} from '@app/pwa/domain/models/pwa.model';

/** The app starts (`providePwaState()`). */
export const enterApp = createAction('[Pwa/Page] Enter app');
/** The settings page opens: storage status and permission are read again. */
export const enterAppSettings = createAction('[Pwa/Page] Enter app settings');
export const clickedInstall = createAction('[Pwa/Page] Clicked install');
export const clickedRequestNotificationPermission = createAction(
  '[Pwa/Page] Clicked request notification permission',
);
export const clickedRequestPersistentStorage = createAction(
  '[Pwa/Page] Clicked request persistent storage',
);
export const clickedReload = createAction('[Pwa/Page] Clicked reload');

export const retrievedPlatform = createAction(
  '[Pwa/API] Retrieved platform',
  props<{ platform: PlatformInfo }>(),
);
export const receivedAppUpdate = createAction(
  '[Pwa/API] Received app update',
  props<{ event: AppUpdateEvent }>(),
);
export const receivedInstallAvailability = createAction(
  '[Pwa/API] Received install availability',
  props<{ available: boolean }>(),
);
export const receivedAppInstalled = createAction('[Pwa/API] Received app installed');
export const installPromptSuccess = createAction(
  '[Pwa/API] Install prompt success',
  props<{ outcome: InstallOutcome }>(),
);
export const installPromptFailure = createAction(
  '[Pwa/API] Install prompt failure',
  props<{ error: unknown }>(),
);
export const retrievedNotificationPermission = createAction(
  '[Pwa/API] Retrieved notification permission',
  props<{ permission: NotificationPermissionState }>(),
);
export const requestNotificationPermissionFailure = createAction(
  '[Pwa/API] Request notification permission failure',
  props<{ error: unknown }>(),
);
export const retrievedStorageStatus = createAction(
  '[Pwa/API] Retrieved storage status',
  props<{ status: StorageStatus }>(),
);
export const requestPersistentStorageSuccess = createAction(
  '[Pwa/API] Request persistent storage success',
  props<{ persisted: boolean }>(),
);
