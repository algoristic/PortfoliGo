import { Action, createReducer, on } from '@ngrx/store';

import { NotificationPermissionState } from '@app/notifications/domain/models/browser-notification.model';
import { AppUpdateEvent, PlatformInfo, StorageStatus } from '@app/pwa/domain/models/pwa.model';

import * as PwaActions from './pwa.actions';

export const PWA_FEATURE_KEY = 'pwa';

export interface PwaState {
  /** The notice of the service worker; `unrecoverable` is kept over a later new version. */
  update: AppUpdateEvent | null;
  platform: PlatformInfo;
  installAvailable: boolean;
  /** Installed in this session (`appinstalled` or an accepted dialog). */
  installed: boolean;
  installing: boolean;
  notificationPermission: NotificationPermissionState;
  requestingPermission: boolean;
  /** `null` until the settings page read it. */
  storage: StorageStatus | null;
  requestingPersistence: boolean;
  error?: unknown;
}

export const initialPwaState: PwaState = {
  update: null,
  platform: { standalone: false, ios: false },
  installAvailable: false,
  installed: false,
  installing: false,
  notificationPermission: 'unsupported',
  requestingPermission: false,
  storage: null,
  requestingPersistence: false,
};

const reducer = createReducer(
  initialPwaState,
  on(PwaActions.retrievedPlatform, (state, { platform }) => ({ ...state, platform })),
  on(PwaActions.receivedAppUpdate, (state, { event }) => ({
    ...state,
    update: state.update === 'unrecoverable' ? state.update : event,
  })),
  on(PwaActions.receivedInstallAvailability, (state, { available }) => ({
    ...state,
    installAvailable: available,
  })),
  on(PwaActions.clickedInstall, (state) => ({ ...state, installing: true })),
  on(PwaActions.installPromptSuccess, (state, { outcome }) => ({
    ...state,
    installing: false,
    installed: state.installed || outcome === 'accepted',
  })),
  on(PwaActions.installPromptFailure, (state, { error }) => ({
    ...state,
    installing: false,
    error,
  })),
  on(PwaActions.receivedAppInstalled, (state) => ({ ...state, installed: true })),
  on(PwaActions.clickedRequestNotificationPermission, (state) => ({
    ...state,
    requestingPermission: true,
  })),
  on(PwaActions.retrievedNotificationPermission, (state, { permission }) => ({
    ...state,
    notificationPermission: permission,
    requestingPermission: false,
  })),
  on(PwaActions.requestNotificationPermissionFailure, (state, { error }) => ({
    ...state,
    requestingPermission: false,
    error,
  })),
  on(PwaActions.retrievedStorageStatus, (state, { status }) => ({ ...state, storage: status })),
  on(PwaActions.clickedRequestPersistentStorage, (state) => ({
    ...state,
    requestingPersistence: true,
  })),
  on(PwaActions.requestPersistentStorageSuccess, (state) => ({
    ...state,
    requestingPersistence: false,
  })),
);

export function pwaReducer(state: PwaState | undefined, action: Action): PwaState {
  return reducer(state, action);
}
