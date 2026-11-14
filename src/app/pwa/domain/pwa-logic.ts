import { InstallOffer, PlatformInfo } from './models/pwa.model';

/**
 * What the settings offer for the installation (US-UI-07, TS §13): an installed app needs nothing;
 * a caught `beforeinstallprompt` gives the browser's dialog; on iOS the share menu is the only
 * way; elsewhere the browser offers nothing the app could start.
 */
export function installOffer(
  platform: Readonly<PlatformInfo>,
  promptAvailable: boolean,
  installed: boolean,
): InstallOffer {
  if (platform.standalone || installed) {
    return 'installed';
  }
  if (promptAvailable) {
    return 'prompt';
  }
  return platform.ios ? 'ios-share' : 'unavailable';
}

/**
 * Whether the browser runs on iOS or iPadOS (TS §13). iPadOS reports itself as a Mac, but Macs
 * have no touch screen.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return (
    /\b(iPhone|iPad|iPod)\b/.test(userAgent) ||
    (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)
  );
}

/** Used share of the quota, `null` without both figures or without a quota. */
export function storageUsageRatio(usage: number | null, quota: number | null): number | null {
  return usage === null || quota === null || quota <= 0 ? null : usage / quota;
}
