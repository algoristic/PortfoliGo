import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import {
  BehaviorSubject,
  firstValueFrom,
  NEVER,
  of,
  Subject,
  Subscription,
  throwError,
} from 'rxjs';
import type { Mocked } from 'vitest';

import { emptyMonthlyValues } from '@app/banking/domain/monthly-values-logic';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectStatus } from '@app/engine/feature/state/session.selectors';
import { NOTIFICATION_PORT } from '@app/notifications/data-access/notification-port/notification-port';
import { FakeNotificationPort } from '@app/notifications/data-access/testing/fake-notification-port';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import { NotificationChannelSettings } from '@app/notifications/domain/models/notification-channel.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as NotificationsActions from './notifications.actions';
import { NOTIFICATION_CHANNEL_SETTINGS } from './notifications.config';
import { NotificationsEffects, TOAST_BUNDLE_WINDOW_MS } from './notifications.effects';
import {
  selectAccountNames,
  selectInstrumentNames,
  selectLastSeq,
} from './notifications.selectors';

const NAMES = new Map([['acc-1', 'Girokonto 0000000001 · Hansebank']]);
const INSTRUMENTS = new Map([['stk-0001', 'Nordwerk AG']]);

function uncovered(seq: number): GameNotification {
  return {
    seq,
    tick: 360,
    code: 'account-uncovered',
    params: { accountId: 'acc-1', balance: -12_000, limit: 500_000 },
  };
}

function exceeded(seq: number): GameNotification {
  return {
    seq,
    tick: 360,
    code: 'overdraft-limit-exceeded',
    params: { accountId: 'acc-1', balance: -200_000, limit: 100_000 },
  };
}

function interest(seq: number): GameNotification {
  return {
    seq,
    tick: 360,
    code: 'interest-credited',
    params: { accountId: 'acc-1', amount: 300, tax: 79 },
  };
}

const REPORT: AbsenceReport = {
  from: 0,
  to: 420,
  netWorthBefore: 0,
  netWorthAfter: -180_000,
  flows: emptyMonthlyValues(),
  bookings: 1,
  notifications: 1,
  warnings: [uncovered(1)],
  warningCount: 1,
  orders: [],
  orderCount: 0,
  indices: [],
};

describe('NotificationsEffects', () => {
  let effects: NotificationsEffects;
  let actions$: Subject<Action>;
  let engine: Mocked<
    Pick<
      EngineService,
      'markNotificationsRead' | 'setAutoPause' | 'absenceReport' | 'notifications'
    >
  >;
  let toasts: Mocked<Pick<ToastService, 'show' | 'error'>>;
  let channelSettings$: BehaviorSubject<NotificationChannelSettings>;
  let store: MockStore;
  let notificationPort: FakeNotificationPort;

  beforeEach(() => {
    notificationPort = new FakeNotificationPort('granted');
    actions$ = new Subject();
    channelSettings$ = new BehaviorSubject<NotificationChannelSettings>({ toast: {}, browser: {} });
    engine = {
      markNotificationsRead: vi.fn(),
      setAutoPause: vi.fn(),
      absenceReport: vi.fn(),
      notifications: vi.fn(),
    };
    toasts = { show: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        NotificationsEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: EngineService, useValue: { ...engine, notification$: NEVER, report$: NEVER } },
        { provide: ToastService, useValue: toasts },
        { provide: NOTIFICATION_CHANNEL_SETTINGS, useValue: channelSettings$ },
        { provide: NOTIFICATION_PORT, useValue: notificationPort },
        provideMockStore({
          selectors: [
            { selector: selectAccountNames, value: NAMES },
            { selector: selectInstrumentNames, value: INSTRUMENTS },
            { selector: selectLastSeq, value: 7 },
            { selector: selectStatus, value: 'ready' },
          ],
        }),
      ],
    });
    effects = TestBed.inject(NotificationsEffects);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
    vi.useRealTimers();
  });

  describe('showToasts$', () => {
    let subscription: Subscription;

    beforeEach(() => {
      vi.useFakeTimers();
      subscription = effects.showToasts$.subscribe();
    });

    afterEach(() => subscription.unsubscribe());

    function receive(...notifications: GameNotification[]): void {
      actions$.next(NotificationsActions.receivedNotifications({ tick: 360, notifications }));
    }

    it('bundles notifications of one code within the window into one toast', () => {
      // US-BN-02, TS §12: „3 Warnungen: Konto nicht gedeckt“.
      receive(uncovered(1), exceeded(2));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS / 2);
      receive(uncovered(3), uncovered(4));
      expect(toasts.show).not.toHaveBeenCalled();

      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS / 2);
      expect(toasts.show.mock.calls).toEqual([
        ['warning', '3 Warnungen: Konto nicht gedeckt'],
        [
          'error',
          'Dispo überschritten: Girokonto 0000000001 · Hansebank steht bei -2.000,00 € und überschreitet den Dispo-Rahmen von 1.000,00 €.',
        ],
      ]);
    });

    it('shows notifications after the window in a toast of their own', () => {
      receive(uncovered(1));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS);
      receive(uncovered(2));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS);
      expect(toasts.show.mock.calls.map(([, message]) => message)).toEqual([
        'Konto nicht gedeckt: Girokonto 0000000001 · Hansebank steht bei -120,00 € (Dispo-Rahmen 5.000,00 €).',
        'Konto nicht gedeckt: Girokonto 0000000001 · Hansebank steht bei -120,00 € (Dispo-Rahmen 5.000,00 €).',
      ]);
    });

    it('names the instrument of an order notification', () => {
      receive({
        seq: 1,
        tick: 600,
        code: 'order-expired',
        params: { orderId: 'ord-1', depotId: 'dep-3', instrumentId: 'stk-0001', side: 'sell' },
      });
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS);
      expect(toasts.show.mock.calls.map(([, message]) => message)).toEqual([
        'Order verfallen: Die Verkaufsorder für Nordwerk AG ist verfallen.',
      ]);
    });

    it('shows no toast for codes without a toast by default and opens no window for them', () => {
      receive(interest(1));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS);
      receive(uncovered(2));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS - 1);
      expect(toasts.show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(toasts.show).toHaveBeenCalledTimes(1);
    });

    it('follows the toast switches of this device from the next notification on', () => {
      // TS §12: toast per code is a device setting (AP 6.2).
      channelSettings$.next({ toast: { 'account-uncovered': false }, browser: {} });
      receive(uncovered(1));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS);
      expect(toasts.show).not.toHaveBeenCalled();

      channelSettings$.next({ toast: { 'interest-credited': true }, browser: {} });
      receive(uncovered(2), interest(3));
      vi.advanceTimersByTime(TOAST_BUNDLE_WINDOW_MS);
      expect(toasts.show.mock.calls.map(([tone]) => tone)).toEqual(['warning', 'info']);
    });
  });

  describe('showBrowserNotifications$', () => {
    let subscription: Subscription;

    beforeEach(() => {
      subscription = effects.showBrowserNotifications$.subscribe();
    });

    afterEach(() => {
      subscription.unsubscribe();
      Reflect.deleteProperty(document, 'visibilityState');
    });

    function setHidden(): void {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
    }

    async function receive(...notifications: GameNotification[]): Promise<void> {
      actions$.next(NotificationsActions.receivedNotifications({ tick: 360, notifications }));
      await Promise.resolve();
    }

    it('shows the text of a notification while the app is hidden', async () => {
      // US-BN-04, TS §12: `account-uncovered` has a browser notification by default.
      setHidden();
      await receive(uncovered(1), interest(2));
      expect(notificationPort.shown).toEqual([
        {
          title: 'Konto nicht gedeckt',
          body: 'Girokonto 0000000001 · Hansebank steht bei -120,00 € (Dispo-Rahmen 5.000,00 €).',
          tag: 'pgo-account-uncovered',
        },
      ]);
    });

    it('bundles several notifications of one code with their number', async () => {
      setHidden();
      await receive(uncovered(1), exceeded(2), uncovered(3));
      expect(notificationPort.shown.map(({ title, body }) => [title, body])).toEqual([
        ['Konto nicht gedeckt', '2 Warnungen'],
        [
          'Dispo überschritten',
          'Girokonto 0000000001 · Hansebank steht bei -2.000,00 € und überschreitet den Dispo-Rahmen von 1.000,00 €.',
        ],
      ]);
    });

    it('shows nothing while the app is visible', async () => {
      await receive(uncovered(1));
      expect(notificationPort.shown).toEqual([]);
    });

    it('follows the browser switches of this device', async () => {
      setHidden();
      channelSettings$.next({ toast: {}, browser: { 'account-uncovered': false } });
      await receive(uncovered(1));
      expect(notificationPort.shown).toEqual([]);
    });
  });

  describe('markRead$', () => {
    it('marks everything up to the newest number of the projection as read', async () => {
      engine.markNotificationsRead.mockReturnValue(of({ tick: 1 }));
      const result = firstValueFrom(effects.markRead$);
      actions$.next(NotificationsActions.clickedMarkAllNotificationsRead());
      expect(await result).toEqual(NotificationsActions.markNotificationsReadSuccess());
      expect(engine.markNotificationsRead).toHaveBeenCalledWith({ upTo: 7 });
    });

    it('marks a single notification by its number', async () => {
      engine.markNotificationsRead.mockReturnValue(of({ tick: 1 }));
      const result = firstValueFrom(effects.markRead$);
      actions$.next(NotificationsActions.clickedMarkNotificationRead({ seq: 3 }));
      await result;
      expect(engine.markNotificationsRead).toHaveBeenCalledWith({ seqs: [3] });
    });

    it('sends nothing for „all read“ without notifications', () => {
      store.overrideSelector(selectLastSeq, 0);
      store.refreshState();
      const subscription = effects.markRead$.subscribe();
      actions$.next(NotificationsActions.clickedMarkAllNotificationsRead());
      subscription.unsubscribe();
      expect(engine.markNotificationsRead).not.toHaveBeenCalled();
    });

    it('dispatches markNotificationsReadFailure when the engine rejects it', async () => {
      const error = new EngineCommandError('unknown-notification');
      engine.markNotificationsRead.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.markRead$);
      actions$.next(NotificationsActions.clickedMarkNotificationRead({ seq: 99 }));
      expect(await result).toEqual(NotificationsActions.markNotificationsReadFailure({ error }));
    });
  });

  describe('loadMissedReport$', () => {
    const profile = { id: 'p-a' } as PlayerProfile;
    const loaded = SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 0 } });

    it('asks for the last report once the game is ready after loading', async () => {
      engine.absenceReport.mockReturnValue(of({ kind: 'absenceReport' as const, report: REPORT }));
      const result = firstValueFrom(effects.loadMissedReport$);
      actions$.next(SessionActions.enterGame({ profile }));
      actions$.next(loaded);
      expect(await result).toEqual(NotificationsActions.retrievedAbsenceReport({ report: REPORT }));
    });

    it('waits while the catch-up runs', () => {
      store.overrideSelector(selectStatus, 'catching-up');
      store.refreshState();
      engine.absenceReport.mockReturnValue(of({ kind: 'absenceReport' as const, report: REPORT }));
      const received: Action[] = [];
      const subscription = effects.loadMissedReport$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile }));
      actions$.next(loaded);
      expect(engine.absenceReport).not.toHaveBeenCalled();

      store.overrideSelector(selectStatus, 'ready');
      store.refreshState();
      subscription.unsubscribe();
      expect(received).toEqual([NotificationsActions.retrievedAbsenceReport({ report: REPORT })]);
    });

    it('dispatches nothing without a report', () => {
      engine.absenceReport.mockReturnValue(of({ kind: 'absenceReport' as const, report: null }));
      const received: Action[] = [];
      const subscription = effects.loadMissedReport$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile }));
      actions$.next(loaded);
      subscription.unsubscribe();
      expect(engine.absenceReport).toHaveBeenCalledTimes(1);
      expect(received).toEqual([]);
    });
  });

  describe('showFailure$', () => {
    it.each([
      [
        new EngineCommandError('unknown-notification-code'),
        'Für dieses Ereignis lässt sich die automatische Pause nicht einstellen.',
      ],
      [
        new EngineCommandError('busy'),
        'Das geht gerade nicht, weil die Spielzeit noch berechnet wird.',
      ],
      [new Error('lost'), 'Die automatische Pause konnte nicht geändert werden.'],
    ])('explains a failed auto-pause switch (%s)', (error, message) => {
      const subscription = effects.showFailure$.subscribe();
      actions$.next(NotificationsActions.setAutoPauseFailure({ code: 'month-closed', error }));
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledWith(message);
    });

    it('explains an unknown notification when marking it read', () => {
      const subscription = effects.showFailure$.subscribe();
      actions$.next(
        NotificationsActions.markNotificationsReadFailure({
          error: new EngineCommandError('unknown-notification'),
        }),
      );
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledWith(
        'Diese Benachrichtigung gibt es nicht. Die Liste wird neu geladen.',
      );
    });
  });
});
