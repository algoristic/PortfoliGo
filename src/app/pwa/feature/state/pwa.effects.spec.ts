import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, Subject, Subscription } from 'rxjs';
import type { Mocked } from 'vitest';

import { NOTIFICATION_PORT } from '@app/notifications/data-access/notification-port/notification-port';
import { FakeNotificationPort } from '@app/notifications/data-access/testing/fake-notification-port';
import {
  STORAGE_PERSISTENCE,
  StoragePersistencePort,
} from '@app/players/data-access/service/players-service.config';
import {
  FakeAppUpdate,
  FakeInstallPrompt,
  FakeStorageEstimate,
  providePwaTestPorts,
} from '@app/pwa/data-access/testing/fake-pwa-ports';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PwaActions from './pwa.actions';
import { PwaEffects } from './pwa.effects';
import { selectUpdate } from './pwa.selectors';

describe('PwaEffects', () => {
  let effects: PwaEffects;
  let actions$: Subject<Action>;
  let store: MockStore;
  let update: FakeAppUpdate;
  let install: FakeInstallPrompt;
  let storage: FakeStorageEstimate;
  let notifications: FakeNotificationPort;
  let persistence: Mocked<StoragePersistencePort>;
  let toasts: Mocked<Pick<ToastService, 'success' | 'error'>>;

  beforeEach(() => {
    actions$ = new Subject();
    update = new FakeAppUpdate();
    install = new FakeInstallPrompt();
    storage = new FakeStorageEstimate(1_500_000, 2_000_000_000);
    notifications = new FakeNotificationPort('default', 'denied');
    persistence = { persisted: vi.fn(), persist: vi.fn() };
    toasts = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PwaEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore({ selectors: [{ selector: selectUpdate, value: null }] }),
        providePwaTestPorts({ update, install, storage }),
        { provide: NOTIFICATION_PORT, useValue: notifications },
        { provide: STORAGE_PERSISTENCE, useValue: persistence },
        { provide: ToastService, useValue: toasts },
      ],
    });
    effects = TestBed.inject(PwaEffects);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => store.resetSelectors());

  describe('reload$', () => {
    let subscription: Subscription;

    beforeEach(() => {
      subscription = effects.reload$.subscribe();
    });

    afterEach(() => subscription.unsubscribe());

    it('activates a loaded version before reloading', () => {
      store.overrideSelector(selectUpdate, 'version-ready');
      store.refreshState();
      actions$.next(PwaActions.clickedReload());
      expect(update.reloads).toEqual([true]);
    });

    it('only reloads when the cached version is broken', () => {
      // TS §13: an unrecoverable state cannot be activated, a fresh load fetches the new version.
      store.overrideSelector(selectUpdate, 'unrecoverable');
      store.refreshState();
      actions$.next(PwaActions.clickedReload());
      expect(update.reloads).toEqual([false]);
    });
  });

  describe('watchUpdates$', () => {
    it('passes the events of the service worker on from the start', () => {
      const received: Action[] = [];
      const subscription = effects.watchUpdates$.subscribe((action) => received.push(action));
      update.emit('version-ready');
      actions$.next(PwaActions.enterApp());
      update.emit('version-ready');
      update.emit('unrecoverable');
      subscription.unsubscribe();
      expect(received).toEqual([
        PwaActions.receivedAppUpdate({ event: 'version-ready' }),
        PwaActions.receivedAppUpdate({ event: 'unrecoverable' }),
      ]);
    });
  });

  describe('install$', () => {
    it('opens the dialog the browser offered and reports the answer', async () => {
      install.offer();
      install.outcome = 'dismissed';
      const result = firstValueFrom(effects.install$);
      actions$.next(PwaActions.clickedInstall());
      expect(await result).toEqual(PwaActions.installPromptSuccess({ outcome: 'dismissed' }));
      expect(install.prompts).toBe(1);
    });
  });

  describe('requestNotificationPermission$', () => {
    it('reports the permission the user chose', async () => {
      const result = firstValueFrom(effects.requestNotificationPermission$);
      actions$.next(PwaActions.clickedRequestNotificationPermission());
      expect(await result).toEqual(
        PwaActions.retrievedNotificationPermission({ permission: 'denied' }),
      );
      expect(notifications.requests).toBe(1);
    });
  });

  describe('loadStorageStatus$', () => {
    it('combines the estimate with the persistence', async () => {
      persistence.persisted.mockResolvedValue(true);
      const result = firstValueFrom(effects.loadStorageStatus$);
      actions$.next(PwaActions.enterAppSettings());
      expect(await result).toEqual(
        PwaActions.retrievedStorageStatus({
          status: { usage: 1_500_000, quota: 2_000_000_000, persisted: true },
        }),
      );
    });

    it('shows unknown figures when the browser fails to answer', async () => {
      persistence.persisted.mockRejectedValue(new Error('denied'));
      storage.usage = null;
      storage.quota = null;
      const result = firstValueFrom(effects.loadStorageStatus$);
      actions$.next(PwaActions.enterAppSettings());
      expect(await result).toEqual(
        PwaActions.retrievedStorageStatus({
          status: { usage: null, quota: null, persisted: null },
        }),
      );
    });
  });

  describe('requestPersistentStorage$', () => {
    it('reports a refused request as not persisted', async () => {
      persistence.persist.mockRejectedValue(new Error('blocked'));
      const result = firstValueFrom(effects.requestPersistentStorage$);
      actions$.next(PwaActions.clickedRequestPersistentStorage());
      expect(await result).toEqual(
        PwaActions.requestPersistentStorageSuccess({ persisted: false }),
      );
    });
  });
});
