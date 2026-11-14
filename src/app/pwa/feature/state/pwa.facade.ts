import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as PwaActions from './pwa.actions';
import * as PwaSelectors from './pwa.selectors';

@Injectable()
export class PwaFacade {
  readonly #store = inject(Store);

  update$ = this.#store.pipe(select(PwaSelectors.selectUpdate));
  installOffer$ = this.#store.pipe(select(PwaSelectors.selectInstallOffer));
  installing$ = this.#store.pipe(select(PwaSelectors.selectInstalling));
  notificationPermission$ = this.#store.pipe(select(PwaSelectors.selectNotificationPermission));
  requestingPermission$ = this.#store.pipe(select(PwaSelectors.selectRequestingPermission));
  storage$ = this.#store.pipe(select(PwaSelectors.selectStorage));
  requestingPersistence$ = this.#store.pipe(select(PwaSelectors.selectRequestingPersistence));

  init(): void {
    this.#store.dispatch(PwaActions.enterApp());
  }

  enterAppSettings(): void {
    this.#store.dispatch(PwaActions.enterAppSettings());
  }

  install(): void {
    this.#store.dispatch(PwaActions.clickedInstall());
  }

  requestNotificationPermission(): void {
    this.#store.dispatch(PwaActions.clickedRequestNotificationPermission());
  }

  requestPersistentStorage(): void {
    this.#store.dispatch(PwaActions.clickedRequestPersistentStorage());
  }

  reload(): void {
    this.#store.dispatch(PwaActions.clickedReload());
  }
}
