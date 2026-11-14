/** Version of the `pgo.backup` entry (TS §9.3). */
export const BACKUP_SETTINGS_VERSION = 1;

/** Choices of the reminder interval in days of real time (PS US-EX-03); `null` switches it off. */
export const BACKUP_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export type BackupIntervalDays = (typeof BACKUP_INTERVAL_DAYS)[number];

export const DEFAULT_BACKUP_INTERVAL_DAYS: BackupIntervalDays = 7;

/** After a reminder, the next one waits at least this many days of real time („später“). */
export const BACKUP_REMINDER_SNOOZE_DAYS = 1;

/** A day of real time (wall clock, not game time) in milliseconds. */
export const REAL_DAY_MS = 86_400_000;

/** Wall-clock instants in ms of one player on this device. */
export interface PlayerBackup {
  /** Last export saved as a file or copied to the clipboard. */
  exportedAt?: number;
  /** Last backup reminder shown. */
  remindedAt?: number;
}

/** `data` of `pgo.backup` (TS §9.3): device-wide interval, entries per player ID. */
export interface BackupSettings {
  intervalDays: BackupIntervalDays | null;
  players: Record<string, PlayerBackup>;
}

/** Input of `backupReminderDue`; all instants in ms of the wall clock. */
export interface BackupReminderFacts {
  intervalDays: BackupIntervalDays | null;
  /** Creation of the player's profile (for an imported player: the import). */
  createdAt: number;
  exportedAt?: number;
  remindedAt?: number;
  now: number;
}

/** What the export section shows for the open player. */
export interface PlayerBackupStatus {
  playerId: string;
  exportedAt: number | null;
  intervalDays: BackupIntervalDays | null;
}
