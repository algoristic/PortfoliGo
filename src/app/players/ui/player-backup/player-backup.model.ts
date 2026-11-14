import { BackupIntervalDays } from '@app/players/domain/models/backup.model';

export interface BackupIntervalOption {
  /** `off` or the number of days, as the `<option>` value. */
  value: string;
  intervalDays: BackupIntervalDays | null;
  label: string;
  selected: boolean;
}
