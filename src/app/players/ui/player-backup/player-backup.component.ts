import { Component, computed, input, output } from '@angular/core';

import {
  BACKUP_INTERVAL_DAYS,
  BackupIntervalDays,
  PlayerBackupStatus,
} from '@app/players/domain/models/backup.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatDateTimePipe } from '@app/shared/ui/pipes/format-date-time/format-date-time.pipe';

import { BackupIntervalOption } from './player-backup.model';

/**
 * Export of the player (US-EX-01) with the time of the last export on this device and the interval
 * of the backup reminder (US-EX-03, TS §9.3).
 */
@Component({
  selector: 'app-player-backup',
  imports: [ButtonDirective, IconDirective, FormatDateTimePipe],
  templateUrl: './player-backup.component.html',
  host: { class: 'block' },
})
export class PlayerBackupComponent {
  /** `null` until the status of the player was read. */
  backup = input<PlayerBackupStatus | null>();
  exporting = input<boolean | null>();

  clickedExport = output<void>();
  selectedInterval = output<BackupIntervalDays | null>();

  intervalOptions = computed(() =>
    ([null, ...BACKUP_INTERVAL_DAYS] as const).map((intervalDays): BackupIntervalOption => ({
      value: intervalDays === null ? 'off' : String(intervalDays),
      intervalDays,
      label: intervalLabel(intervalDays),
      selected: intervalDays === this.backup()?.intervalDays,
    })),
  );

  onExport(): void {
    this.clickedExport.emit();
  }

  onSelectInterval(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const option = this.intervalOptions().find((candidate) => candidate.value === value);
    if (option !== undefined) {
      this.selectedInterval.emit(option.intervalDays);
    }
  }
}

function intervalLabel(intervalDays: BackupIntervalDays | null): string {
  switch (intervalDays) {
    case null:
      return $localize`:@@uiPlayers-playerBackup-intervalOff:Nie`;
    case 1:
      return $localize`:@@uiPlayers-playerBackup-intervalDaily:Täglich`;
    case 7:
      return $localize`:@@uiPlayers-playerBackup-intervalWeekly:Wöchentlich`;
    default:
      return $localize`:@@uiPlayers-playerBackup-intervalDays:Alle ${intervalDays}:days: Tage`;
  }
}
