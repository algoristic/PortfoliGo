import fc from 'fast-check';

import {
  backupReminderDue,
  parseBackupSettings,
  withoutPlayerBackup,
  withPlayerBackup,
} from './backup-logic';
import { BackupIntervalDays } from './models/backup.model';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 12);

describe('backupReminderDue', () => {
  // TS §9.3 `pgo.backup`: reminder table (days of real time before now; null = never)
  it.each<[BackupIntervalDays | null, number, number | null, number | null, boolean]>([
    // interval, created, exported, reminded, due
    [7, 7, null, null, true],
    [7, 6, null, null, false],
    [7, 40, 7, null, true],
    [7, 40, 6, null, false],
    [7, 7 - 1 / 1440, null, null, false],
    [7, 40, 10, 1, true],
    [7, 40, 10, 0.5, false],
    [1, 2, 1, null, true],
    [30, 40, 29, null, false],
    [null, 400, null, null, false],
  ])(
    'interval %s, created %s d, exported %s d, reminded %s d ago → %s',
    (intervalDays, created, exported, reminded, due) => {
      expect(
        backupReminderDue({
          intervalDays,
          createdAt: NOW - created * DAY,
          exportedAt: exported === null ? undefined : NOW - exported * DAY,
          remindedAt: reminded === null ? undefined : NOW - reminded * DAY,
          now: NOW,
        }),
      ).toBe(due);
    },
  );

  it('never reminds sooner than the interval after an export', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BackupIntervalDays>(1, 3, 7, 14, 30),
        fc.integer({ min: 0, max: 30 * DAY }),
        (intervalDays, age) => {
          const due = backupReminderDue({
            intervalDays,
            createdAt: NOW - 400 * DAY,
            exportedAt: NOW - age,
            now: NOW,
          });
          expect(due).toBe(age >= intervalDays * DAY);
        },
      ),
    );
  });
});

describe('parseBackupSettings', () => {
  it('starts with a seven-day interval and no players', () => {
    expect(parseBackupSettings(undefined)).toEqual({ intervalDays: 7, players: {} });
    expect(parseBackupSettings([1])).toEqual({ intervalDays: 7, players: {} });
    expect(parseBackupSettings(null)).toEqual({ intervalDays: 7, players: {} });
    expect(parseBackupSettings({ players: { a: null } })).toEqual({ intervalDays: 7, players: {} });
  });

  it('keeps valid values, an interval switched off and drops invalid ones', () => {
    expect(
      parseBackupSettings({
        intervalDays: null,
        players: {
          a: { exportedAt: 5, remindedAt: 'x' },
          b: 'broken',
          c: { remindedAt: 7, exportedAt: Number.NaN },
        },
      }),
    ).toEqual({ intervalDays: null, players: { a: { exportedAt: 5 }, c: { remindedAt: 7 } } });
    expect(parseBackupSettings({ intervalDays: 5 }).intervalDays).toBe(7);
    expect(parseBackupSettings({ intervalDays: 14 }).intervalDays).toBe(14);
  });
});

describe('withPlayerBackup and withoutPlayerBackup', () => {
  it('changes only the given player', () => {
    const settings = { intervalDays: 7 as const, players: { a: { exportedAt: 1 }, b: {} } };
    expect(withPlayerBackup(settings, 'a', { remindedAt: 2 })).toEqual({
      intervalDays: 7,
      players: { a: { exportedAt: 1, remindedAt: 2 }, b: {} },
    });
    expect(withoutPlayerBackup(settings, 'a')).toEqual({ intervalDays: 7, players: { b: {} } });
    expect(settings.players.a).toEqual({ exportedAt: 1 });
  });
});
