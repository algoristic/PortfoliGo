import { NotificationChannelSettings } from '@app/notifications/domain/models/notification-channel.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';

import { bundleToastNotifications, toastTone } from './notifications.utils';

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

describe('bundleToastNotifications', () => {
  // US-BN-02, TS §12: one toast per code within the window, with the number of notifications.
  it('bundles notifications of one code and keeps the newest for the text', () => {
    expect(bundleToastNotifications([uncovered(1), uncovered(3), uncovered(2)], DEFAULTS)).toEqual([
      { code: 'account-uncovered', severity: 'warning', count: 3, latest: uncovered(3) },
    ]);
  });

  it('keeps codes apart in the order they first occurred', () => {
    expect(
      bundleToastNotifications(
        [exceeded(2), uncovered(1), exceeded(4), uncovered(3)],
        DEFAULTS,
      ).map(({ code, severity, count }) => [code, severity, count]),
    ).toEqual([
      ['overdraft-limit-exceeded', 'critical', 2],
      ['account-uncovered', 'warning', 2],
    ]);
  });

  it('leaves out codes without a toast by default', () => {
    // TS §12: `interest-credited` has no toast, `year-closed` has one.
    expect(
      bundleToastNotifications([interest(1), yearClosed(2), interest(3)], DEFAULTS).map(
        ({ code }) => code,
      ),
    ).toEqual(['year-closed']);
    expect(bundleToastNotifications([interest(1)], DEFAULTS)).toEqual([]);
  });

  it('follows the toast switches of the device over the defaults', () => {
    const settings: NotificationChannelSettings = {
      toast: { 'account-uncovered': false, 'interest-credited': true },
      browser: { 'year-closed': true },
    };
    expect(
      bundleToastNotifications([uncovered(1), interest(2), yearClosed(3)], settings).map(
        ({ code }) => code,
      ),
    ).toEqual(['interest-credited', 'year-closed']);
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
