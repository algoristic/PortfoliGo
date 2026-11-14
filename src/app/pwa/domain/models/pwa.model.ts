/**
 * What the service worker reports (TS §13, §15): a new version is loaded and becomes active with
 * the next start, or the cached version is broken and the app has to reload.
 */
export const APP_UPDATE_EVENTS = ['version-ready', 'unrecoverable'] as const;
export type AppUpdateEvent = (typeof APP_UPDATE_EVENTS)[number];

/** The platform the app runs on, as far as the installation hint needs it (US-UI-07). */
export interface PlatformInfo {
  /** Runs as an installed app (`display-mode: standalone`, `navigator.standalone` on iOS). */
  standalone: boolean;
  /** iPhone, iPad or iPod: installing works only through „Teilen“ → „Zum Home-Bildschirm“. */
  ios: boolean;
}

/**
 * What the settings offer for the installation (US-UI-07, TS §13): nothing to do, the browser's
 * dialog, the way through the share menu of iOS, or no way the app knows of.
 */
export const INSTALL_OFFERS = ['installed', 'prompt', 'ios-share', 'unavailable'] as const;
export type InstallOffer = (typeof INSTALL_OFFERS)[number];

/** Answer of the browser's installation dialog; `unavailable` when it can't be shown. */
export const INSTALL_OUTCOMES = ['accepted', 'dismissed', 'unavailable'] as const;
export type InstallOutcome = (typeof INSTALL_OUTCOMES)[number];

/** Storage of this origin (US-EX-03, TS §9.5); `null` where the browser tells nothing. */
export interface StorageStatus {
  /** Bytes used by this origin. */
  usage: number | null;
  /** Bytes this origin may use at most. */
  quota: number | null;
  /** Whether the browser keeps the data under storage pressure (`navigator.storage.persisted()`). */
  persisted: boolean | null;
}
