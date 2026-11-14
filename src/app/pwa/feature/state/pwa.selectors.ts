import { createFeatureSelector, createSelector } from '@ngrx/store';

import { installOffer } from '@app/pwa/domain/pwa-logic';

import { PWA_FEATURE_KEY, PwaState } from './pwa.reducer';

const selectState = createFeatureSelector<PwaState>(PWA_FEATURE_KEY);

export const selectUpdate = createSelector(selectState, (state) => state.update);
export const selectInstallOffer = createSelector(selectState, (state) =>
  installOffer(state.platform, state.installAvailable, state.installed),
);
export const selectInstalling = createSelector(selectState, (state) => state.installing);
export const selectNotificationPermission = createSelector(
  selectState,
  (state) => state.notificationPermission,
);
export const selectRequestingPermission = createSelector(
  selectState,
  (state) => state.requestingPermission,
);
export const selectStorage = createSelector(selectState, (state) => state.storage);
export const selectRequestingPersistence = createSelector(
  selectState,
  (state) => state.requestingPersistence,
);
