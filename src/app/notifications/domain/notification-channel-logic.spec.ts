import fc from 'fast-check';

import {
  DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
  NotificationChannelSettings,
} from './models/notification-channel.model';
import { NOTIFICATION_CODES, NotificationCode } from './models/notification.model';
import {
  effectiveNotificationChannels,
  hasNotificationChannel,
  notificationChannelEnabled,
  parseNotificationChannelOverrides,
  withNotificationChannel,
} from './notification-channel-logic';

const arbCode = fc.constantFrom(...NOTIFICATION_CODES);
const arbChannel = fc.constantFrom(...NOTIFICATION_CHANNELS);
const arbSettings: fc.Arbitrary<NotificationChannelSettings> = fc.record({
  toast: fc.dictionary(arbCode, fc.boolean()),
  browser: fc.dictionary(arbCode, fc.boolean()),
});

describe('notification-channel-logic', () => {
  describe('notificationChannelEnabled', () => {
    // TS §12: example table "Toast und Browser je Code"
    it.each<[NotificationCode, NotificationChannel, boolean | undefined, boolean]>([
      ['order-executed', 'toast', undefined, true],
      ['order-executed', 'toast', false, false],
      ['dividend-received', 'toast', undefined, false],
      ['dividend-received', 'toast', true, true],
      ['account-uncovered', 'browser', undefined, true],
      ['account-uncovered', 'browser', false, false],
      ['order-executed', 'browser', undefined, false],
      ['order-executed', 'browser', true, true],
      ['backup-reminder', 'toast', undefined, true],
      ['backup-reminder', 'toast', false, false],
      ['backup-reminder', 'browser', true, false],
    ])('gives %s on %s with setting %s: %s', (code, channel, setting, expected) => {
      const settings: NotificationChannelSettings = {
        toast: {},
        browser: {},
        [channel]: setting === undefined ? {} : { [code]: setting },
      };
      expect(notificationChannelEnabled(settings, channel, code)).toBe(expected);
    });

    it('reads the setting of the asked channel only', () => {
      const settings: NotificationChannelSettings = {
        toast: { 'order-rejected': false },
        browser: {},
      };
      expect(notificationChannelEnabled(settings, 'browser', 'order-rejected')).toBe(true);
      expect(notificationChannelEnabled(settings, 'toast', 'order-rejected')).toBe(false);
    });
  });

  describe('effectiveNotificationChannels', () => {
    it('lists the defaults of TS §12 for a new device', () => {
      const { toast, browser } = effectiveNotificationChannels(
        DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
      );
      // TS §12: columns "Toast" and "Browser"
      expect(NOTIFICATION_CODES.filter((code) => toast[code])).toEqual([
        'account-uncovered',
        'overdraft-limit-exceeded',
        'standing-order-failed',
        'order-executed',
        'order-rejected',
        'order-expired',
        'savings-plan-failed',
        'year-closed',
        'storage-quota-exceeded',
        'market-checksum-mismatch',
        'backup-reminder',
      ]);
      expect(NOTIFICATION_CODES.filter((code) => browser[code])).toEqual([
        'account-uncovered',
        'overdraft-limit-exceeded',
        'standing-order-failed',
        'order-rejected',
        'savings-plan-failed',
      ]);
    });

    it('agrees with notificationChannelEnabled for every code and channel', () => {
      fc.assert(
        fc.property(arbSettings, (settings) => {
          const effective = effectiveNotificationChannels(settings);
          for (const channel of NOTIFICATION_CHANNELS) {
            for (const code of NOTIFICATION_CODES) {
              expect(effective[channel][code]).toBe(
                notificationChannelEnabled(settings, channel, code),
              );
            }
          }
        }),
      );
    });
  });

  describe('hasNotificationChannel', () => {
    it('gives every code a toast and every code but the UI code a browser notification', () => {
      for (const code of NOTIFICATION_CODES) {
        expect(hasNotificationChannel(code, 'toast')).toBe(true);
        expect(hasNotificationChannel(code, 'browser')).toBe(code !== 'backup-reminder');
      }
    });
  });

  describe('withNotificationChannel', () => {
    it('stores a deviation and removes it again when the default is chosen', () => {
      const off = withNotificationChannel(
        DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
        'toast',
        'order-executed',
        false,
      );
      expect(off).toEqual({ toast: { 'order-executed': false }, browser: {} });
      expect(withNotificationChannel(off, 'toast', 'order-executed', true)).toEqual({
        toast: {},
        browser: {},
      });
    });

    it('stores nothing for a channel the code does not have', () => {
      expect(
        withNotificationChannel(
          DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
          'browser',
          'backup-reminder',
          true,
        ),
      ).toEqual({ toast: {}, browser: {} });
    });

    it('makes the chosen value effective and keeps every other code and channel', () => {
      fc.assert(
        fc.property(
          arbSettings,
          arbChannel,
          arbCode,
          fc.boolean(),
          (settings, channel, code, enabled) => {
            const result = withNotificationChannel(settings, channel, code, enabled);
            expect(notificationChannelEnabled(result, channel, code)).toBe(
              hasNotificationChannel(code, channel) && enabled,
            );
            for (const other of NOTIFICATION_CHANNELS) {
              for (const otherCode of NOTIFICATION_CODES) {
                if (other !== channel || otherCode !== code) {
                  expect(notificationChannelEnabled(result, other, otherCode)).toBe(
                    notificationChannelEnabled(settings, other, otherCode),
                  );
                }
              }
            }
          },
        ),
      );
    });
  });

  describe('parseNotificationChannelOverrides', () => {
    // TS §9.3: invalid entries are dropped one by one, defaults are not stored.
    it.each<[string, NotificationChannel, unknown, unknown]>([
      ['nothing', 'toast', undefined, {}],
      ['null', 'toast', null, {}],
      ['an array', 'toast', [true], {}],
      ['a deviation', 'toast', { 'order-executed': false }, { 'order-executed': false }],
      ['the default', 'toast', { 'order-executed': true }, {}],
      ['an unknown code', 'toast', { 'stock-split': true }, {}],
      ['a string', 'toast', { 'order-executed': 'false' }, {}],
      ['the UI code in the browser', 'browser', { 'backup-reminder': true }, {}],
      [
        'valid and invalid entries',
        'browser',
        { 'order-executed': true, 'order-rejected': false, 'month-closed': 1 },
        { 'order-executed': true, 'order-rejected': false },
      ],
    ])('reads %s', (_label, channel, data, expected) => {
      expect(parseNotificationChannelOverrides(data, channel)).toEqual(expected);
    });

    it('reads back what withNotificationChannel stored', () => {
      fc.assert(
        fc.property(arbChannel, fc.array(fc.tuple(arbCode, fc.boolean())), (channel, changes) => {
          const settings = changes.reduce(
            (result, [code, enabled]) => withNotificationChannel(result, channel, code, enabled),
            DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
          );
          const stored: unknown = JSON.parse(JSON.stringify(settings[channel]));
          expect(parseNotificationChannelOverrides(stored, channel)).toEqual(settings[channel]);
        }),
      );
    });
  });
});
