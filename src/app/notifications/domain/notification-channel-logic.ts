import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
  NotificationChannelOverrides,
  NotificationChannelSettings,
} from './models/notification-channel.model';
import {
  NOTIFICATION_CODE_INFO,
  NOTIFICATION_CODES,
  NotificationCode,
} from './models/notification.model';

/**
 * Whether `code` has `channel` at all: UI codes (`backup-reminder`) appear only while the app is
 * visible, so they never become browser notifications (TS §12).
 */
export function hasNotificationChannel(
  code: NotificationCode,
  channel: NotificationChannel,
): boolean {
  return channel === 'toast' || NOTIFICATION_CODE_INFO[code].source !== 'ui';
}

/** The device setting of `code` on `channel`, else the default of TS §12. */
export function notificationChannelEnabled(
  settings: Readonly<NotificationChannelSettings>,
  channel: NotificationChannel,
  code: NotificationCode,
): boolean {
  if (!hasNotificationChannel(code, channel)) {
    return false;
  }
  return settings[channel][code] ?? NOTIFICATION_CODE_INFO[code][channel];
}

/** The effective setting of every code on both channels, in the order of TS §12. */
export function effectiveNotificationChannels(
  settings: Readonly<NotificationChannelSettings>,
): Record<NotificationChannel, Record<NotificationCode, boolean>> {
  const result = {} as Record<NotificationChannel, Record<NotificationCode, boolean>>;
  for (const channel of NOTIFICATION_CHANNELS) {
    result[channel] = {} as Record<NotificationCode, boolean>;
    for (const code of NOTIFICATION_CODES) {
      result[channel][code] = notificationChannelEnabled(settings, channel, code);
    }
  }
  return result;
}

/** Sets `code` on `channel`; only settings that differ from the default are kept. */
export function withNotificationChannel(
  settings: Readonly<NotificationChannelSettings>,
  channel: NotificationChannel,
  code: NotificationCode,
  enabled: boolean,
): NotificationChannelSettings {
  const overrides: NotificationChannelOverrides = { ...settings[channel] };
  if (!hasNotificationChannel(code, channel) || enabled === NOTIFICATION_CODE_INFO[code][channel]) {
    delete overrides[code];
  } else {
    overrides[code] = enabled;
  }
  return { ...settings, [channel]: overrides };
}

/**
 * The overrides of one channel from stored data (TS §9.3): unknown codes, codes without the
 * channel, values that are no Boolean and values equal to the default are dropped one by one.
 */
export function parseNotificationChannelOverrides(
  data: unknown,
  channel: NotificationChannel,
): NotificationChannelOverrides {
  const overrides: NotificationChannelOverrides = {};
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return overrides;
  }
  const record = data as Record<string, unknown>;
  for (const code of NOTIFICATION_CODES) {
    const value = Object.hasOwn(record, code) ? record[code] : undefined;
    if (
      typeof value === 'boolean' &&
      hasNotificationChannel(code, channel) &&
      value !== NOTIFICATION_CODE_INFO[code][channel]
    ) {
      overrides[code] = value;
    }
  }
  return overrides;
}
