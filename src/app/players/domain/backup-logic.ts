import {
  BACKUP_INTERVAL_DAYS,
  BACKUP_REMINDER_SNOOZE_DAYS,
  BackupIntervalDays,
  BackupReminderFacts,
  BackupSettings,
  DEFAULT_BACKUP_INTERVAL_DAYS,
  PlayerBackup,
  REAL_DAY_MS,
} from './models/backup.model';

/**
 * The backup reminder (PS US-EX-03, TS §9.3): due when the interval is on, at least `intervalDays`
 * of real time passed since the last export (never exported: since the player was created) and
 * at least `BACKUP_REMINDER_SNOOZE_DAYS` since the last reminder.
 */
export function backupReminderDue(facts: BackupReminderFacts): boolean {
  const { intervalDays, createdAt, exportedAt, remindedAt, now } = facts;
  if (intervalDays === null) {
    return false;
  }
  const since = exportedAt ?? createdAt;
  if (now - since < intervalDays * REAL_DAY_MS) {
    return false;
  }
  return remindedAt === undefined || now - remindedAt >= BACKUP_REMINDER_SNOOZE_DAYS * REAL_DAY_MS;
}

export function isBackupIntervalDays(value: unknown): value is BackupIntervalDays {
  return BACKUP_INTERVAL_DAYS.some((days) => days === value);
}

/**
 * A stored `pgo.backup` (TS §9.3): a missing or invalid interval becomes the default, `null` stays
 * off; player entries keep only finite instants, other entries are dropped.
 */
export function parseBackupSettings(data: unknown): BackupSettings {
  const record = isRecord(data) ? data : {};
  const intervalDays =
    record['intervalDays'] === null
      ? null
      : isBackupIntervalDays(record['intervalDays'])
        ? record['intervalDays']
        : DEFAULT_BACKUP_INTERVAL_DAYS;
  const players: Record<string, PlayerBackup> = {};
  if (isRecord(record['players'])) {
    for (const [playerId, entry] of Object.entries(record['players'])) {
      if (isRecord(entry)) {
        const backup: PlayerBackup = {};
        if (isInstant(entry['exportedAt'])) {
          backup.exportedAt = entry['exportedAt'];
        }
        if (isInstant(entry['remindedAt'])) {
          backup.remindedAt = entry['remindedAt'];
        }
        players[playerId] = backup;
      }
    }
  }
  return { intervalDays, players };
}

/** `settings` with `changes` merged into the player's entry; other players stay. */
export function withPlayerBackup(
  settings: BackupSettings,
  playerId: string,
  changes: PlayerBackup,
): BackupSettings {
  return {
    ...settings,
    players: { ...settings.players, [playerId]: { ...settings.players[playerId], ...changes } },
  };
}

/** `settings` without the entry of a deleted player. */
export function withoutPlayerBackup(settings: BackupSettings, playerId: string): BackupSettings {
  return {
    ...settings,
    players: Object.fromEntries(Object.entries(settings.players).filter(([id]) => id !== playerId)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `Number.isFinite` doesn't convert its argument, so it is false for every non-number.
function isInstant(value: unknown): value is number {
  return Number.isFinite(value);
}
