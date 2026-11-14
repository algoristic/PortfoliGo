import { NotificationCode } from './notification.model';

/**
 * Channels a device switches per code (TS §12): toasts in the app and browser notifications while
 * the app is hidden (AP 6.3). Auto-pause is a player setting and not a channel.
 */
export const NOTIFICATION_CHANNELS = ['toast', 'browser'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Settings per channel where the device differs from the default of TS §12. */
export type NotificationChannelOverrides = Partial<Record<NotificationCode, boolean>>;

/** The section `notifications` of `pgo.settings` (TS §9.3). */
export type NotificationChannelSettings = Record<NotificationChannel, NotificationChannelOverrides>;

export const DEFAULT_NOTIFICATION_CHANNEL_SETTINGS: NotificationChannelSettings = {
  toast: {},
  browser: {},
};
