import { NotificationChannelSettings } from '@app/notifications/domain/models/notification-channel.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';

import { bundleNotifications, toastTone } from './notifications.utils';

function uncovered(seq: number): GameNotification {
  return {
    seq,
    tick: 100,
    code: 'account-uncovered',
    params: { accountId: `acc-${seq}`, balance: -seq, limit: null },
  };
}

function exceeded(seq: number): GameNotification {
  return {
    seq,
    tick: 100,
    code: 'overdraft-limit-exceeded',
    params: { accountId: 'acc-1', balance: -seq, limit: 0 },
  };
}

function interest(seq: number): GameNotification {
  return {
    seq,
    tick: 100,
    code: 'interest-credited',
    params: { accountId: 'acc-1', amount: 300, tax: 79 },
  };
}

function yearClosed(seq: number): GameNotification {
  return {
    seq,
    tick: 100,
    code: 'year-closed',
    params: { year: 2030, taxableIncome: 0, taxWithheld: 0 },
  };
}

/** A device without own settings: the defaults of TS §12. */
const DEFAULTS: NotificationChannelSettings = { toast: {}, browser: {} };

describe('bundleNotifications', () => {
  // US-BN-02, TS §12: one toast per code within the window, with the number of notifications.
  it('bundles notifications of one code and keeps the newest for the text', () => {
    expect(
      bundleNotifications([uncovered(1), uncovered(3), uncovered(2)], DEFAULTS, 'toast'),
    ).toEqual([{ code: 'account-uncovered', severity: 'warning', count: 3, latest: uncovered(3) }]);
  });

  it('keeps codes apart in the order they first occurred', () => {
    expect(
      bundleNotifications(
        [exceeded(2), uncovered(1), exceeded(4), uncovered(3)],
        DEFAULTS,
        'toast',
      ).map(({ code, severity, count }) => [code, severity, count]),
    ).toEqual([
      ['overdraft-limit-exceeded', 'critical', 2],
      ['account-uncovered', 'warning', 2],
    ]);
  });

  it('leaves out codes without a toast by default', () => {
    // TS §12: `interest-credited` has no toast, `year-closed` has one.
    expect(
      bundleNotifications([interest(1), yearClosed(2), interest(3)], DEFAULTS, 'toast').map(
        ({ code }) => code,
      ),
    ).toEqual(['year-closed']);
    expect(bundleNotifications([interest(1)], DEFAULTS, 'toast')).toEqual([]);
  });

  it('follows the toast switches of the device over the defaults', () => {
    const settings: NotificationChannelSettings = {
      toast: { 'account-uncovered': false, 'interest-credited': true },
      browser: { 'year-closed': true },
    };
    expect(
      bundleNotifications([uncovered(1), interest(2), yearClosed(3)], settings, 'toast').map(
        ({ code }) => code,
      ),
    ).toEqual(['interest-credited', 'year-closed']);
  });

  it('bundles by the browser switches for browser notifications', () => {
    // TS §12: `account-uncovered` has a browser notification by default, `year-closed` has none.
    const settings: NotificationChannelSettings = {
      toast: {},
      browser: { 'year-closed': true, 'overdraft-limit-exceeded': false },
    };
    expect(
      bundleNotifications(
        [uncovered(1), exceeded(2), yearClosed(3), interest(4), uncovered(5)],
        settings,
        'browser',
      ).map(({ code, count }) => [code, count]),
    ).toEqual([
      ['account-uncovered', 2],
      ['year-closed', 1],
    ]);
  });
});

describe('toastTone', () => {
  it.each([
    ['critical', 'error'],
    ['warning', 'warning'],
    ['info', 'info'],
    ['hint', 'info'],
  ] as const)('shows %s notifications as %s toasts', (severity, tone) => {
    expect(toastTone(severity)).toBe(tone);
  });
});
