import {
  AUTO_PAUSE_CODES,
  AutoPauseCode,
  NOTIFICATION_CODE_INFO,
  NotificationState,
} from './models/notification.model';

/**
 * How the engine runs when a notification arises (TS §3.6, §3.7): live with the clock, catching up
 * after loading (the replay of a restore counts as catching up), or jumping.
 */
export const RUN_MODES = ['live', 'catch-up', 'jump'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export type AutoPauseSettings = NotificationState['autoPause'];

export function isAutoPauseCode(code: string): code is AutoPauseCode {
  return (AUTO_PAUSE_CODES as readonly string[]).includes(code);
}

/** The player's setting for `code`, else the default of TS §12. */
export function autoPauseEnabled(
  settings: Readonly<AutoPauseSettings>,
  code: AutoPauseCode,
): boolean {
  return settings[code] ?? NOTIFICATION_CODE_INFO[code].autoPause === true;
}

/** The effective setting of every code, in the order of TS §12 (settings page, projection). */
export function autoPauseSettings(
  settings: Readonly<AutoPauseSettings>,
): Record<AutoPauseCode, boolean> {
  const result = {} as Record<AutoPauseCode, boolean>;
  for (const code of AUTO_PAUSE_CODES) {
    result[code] = autoPauseEnabled(settings, code);
  }
  return result;
}

/** Sets the auto-pause of `code`; only settings that differ from the default are kept. */
export function withAutoPause(
  settings: Readonly<AutoPauseSettings>,
  code: AutoPauseCode,
  enabled: boolean,
): AutoPauseSettings {
  const result: AutoPauseSettings = { ...settings };
  if (enabled === (NOTIFICATION_CODE_INFO[code].autoPause === true)) {
    delete result[code];
  } else {
    result[code] = enabled;
  }
  return result;
}

/**
 * Whether an auto-pause takes effect (TS §3.6, §12, US-ZT-06): only while the app is visible, live
 * or jumping; never while catching up. Hidden or catching up, the events go into the absence report
 * instead, so that the real time of the idea collection is kept.
 */
export function autoPauseApplies(mode: RunMode, visible: boolean): boolean {
  return visible && mode !== 'catch-up';
}

/** A notification with this code pauses the game now. */
export function shouldAutoPause(
  code: AutoPauseCode,
  settings: Readonly<AutoPauseSettings>,
  mode: RunMode,
  visible: boolean,
): boolean {
  return autoPauseEnabled(settings, code) && autoPauseApplies(mode, visible);
}
