import { Component, computed, input, output } from '@angular/core';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { PlayerListEntry } from '@app/players/domain/models/player.model';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { FormatDateTimePipe } from '@app/shared/ui/pipes/format-date-time/format-date-time.pipe';

import { PlayerListRow } from './player-list.model';

const ROW_CLASSES =
  'flex flex-col gap-3 rounded-lg border bg-surface p-4 sm:flex-row sm:items-center';

/** Players on this device (PS US-SP-02); the last used one is highlighted. */
@Component({
  selector: 'app-player-list',
  imports: [
    BadgeComponent,
    ButtonDirective,
    IconDirective,
    IconButtonDirective,
    FormatGameTimePipe,
    FormatDateTimePipe,
  ],
  templateUrl: './player-list.component.html',
  host: { class: 'block' },
})
export class PlayerListComponent {
  players = input.required<PlayerListEntry[]>();
  lastPlayerId = input<string | null | undefined>();

  selectedPlayer = output<string>();
  clickedRenamePlayer = output<string>();
  clickedDeletePlayer = output<string>();

  rows = computed(() =>
    this.players().map((player): PlayerListRow => {
      const isLast = player.id === this.lastPlayerId();
      return {
        ...player,
        isLast,
        renameLabel: $localize`:@@uiPlayers-playerList-rename:${player.name}:name: umbenennen`,
        deleteLabel: $localize`:@@uiPlayers-playerList-delete:${player.name}:name: löschen`,
        openLabel: $localize`:@@uiPlayers-playerList-openPlayer:${player.name}:name: öffnen`,
        classes: `${ROW_CLASSES} ${isLast ? 'border-accent' : 'border-border'}`,
      };
    }),
  );

  onOpen(playerId: string): void {
    this.selectedPlayer.emit(playerId);
  }

  onRename(playerId: string): void {
    this.clickedRenamePlayer.emit(playerId);
  }

  onDelete(playerId: string): void {
    this.clickedDeletePlayer.emit(playerId);
  }
}
