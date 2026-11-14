import { parseNotificationChannelOverrides } from '@app/notifications/domain/notification-channel-logic';

import {
  CHANGE_COLOR_SETTINGS,
  COLOR_SCHEME_SETTINGS,
  DEFAULT_SETTINGS,
  Settings,
} from './models/settings.model';

/**
 * Settings from the stored `data` of `pgo.settings` (TS §9.3): every value that is missing or
 * invalid gets its default, valid values of other sections are kept. `src/index.html` reads
 * `appearance.colorScheme` and `appearance.changeColors` the same way before Angular starts.
 */
export function parseSettings(data: unknown): Settings {
  const appearance = sectionOf(data, 'appearance');
  const motion = sectionOf(data, 'motion');
  const shortcuts = sectionOf(data, 'shortcuts');
  const notifications = sectionOf(data, 'notifications');
  return {
    appearance: {
      colorScheme: oneOf(
        COLOR_SCHEME_SETTINGS,
        appearance['colorScheme'],
        DEFAULT_SETTINGS.appearance.colorScheme,
      ),
      changeColors: oneOf(
        CHANGE_COLOR_SETTINGS,
        appearance['changeColors'],
        DEFAULT_SETTINGS.appearance.changeColors,
      ),
    },
    motion: {
      priceHighlight: booleanOr(motion['priceHighlight'], DEFAULT_SETTINGS.motion.priceHighlight),
    },
    shortcuts: {
      enabled: booleanOr(shortcuts['enabled'], DEFAULT_SETTINGS.shortcuts.enabled),
    },
    notifications: {
      toast: parseNotificationChannelOverrides(notifications['toast'], 'toast'),
      browser: parseNotificationChannelOverrides(notifications['browser'], 'browser'),
    },
  };
}

function sectionOf(data: unknown, key: string): Record<string, unknown> {
  const section = isRecord(data) ? data[key] : undefined;
  return isRecord(section) ? section : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return (values as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
