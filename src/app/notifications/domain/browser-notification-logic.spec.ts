import { browserNotificationApplies, browserNotificationTag } from './browser-notification-logic';
import { NotificationPermissionState } from './models/browser-notification.model';
import { NotificationChannelSettings } from './models/notification-channel.model';
import { NotificationCode } from './models/notification.model';

const DEFAULTS: NotificationChannelSettings = { toast: {}, browser: {} };

describe('browserNotificationApplies', () => {
  // TS §12, „Browser-Benachrichtigungen (AP 6.3)“: example table.
  it.each<[NotificationCode, boolean, NotificationPermissionState, boolean | null, boolean]>([
    ['account-uncovered', false, 'granted', null, true],
    ['account-uncovered', true, 'granted', null, false],
    ['account-uncovered', false, 'default', null, false],
    ['account-uncovered', false, 'denied', null, false],
    ['account-uncovered', false, 'unsupported', null, false],
    ['account-uncovered', false, 'granted', false, false],
    ['order-executed', false, 'granted', null, false],
    ['order-executed', false, 'granted', true, true],
    ['backup-reminder', false, 'granted', true, false],
  ])(
    '%s, visible %s, permission %s, setting %s → %s',
    (code, visible, permission, setting, expected) => {
      const settings: NotificationChannelSettings =
        setting === null ? DEFAULTS : { toast: {}, browser: { [code]: setting } };
      expect(browserNotificationApplies(code, { visible, permission, settings })).toBe(expected);
    },
  );
});

describe('browserNotificationTag', () => {
  it('gives every code its own tag', () => {
    expect(browserNotificationTag('account-uncovered')).toBe('pgo-account-uncovered');
    expect(browserNotificationTag('order-rejected')).not.toBe(
      browserNotificationTag('account-uncovered'),
    );
  });
});
