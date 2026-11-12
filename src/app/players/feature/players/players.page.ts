import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { PlayerListComponent } from '../../ui/player-list/player-list.component';
import { PlayersFacade } from '../state/players.facade';

@Component({
  selector: 'app-players-page',
  imports: [
    CommonModule,
    RouterModule,
    PanelComponent,
    EmptyStateComponent,
    ButtonDirective,
    IconDirective,
    SkeletonComponent,
    PlayerListComponent,
  ],
  templateUrl: './players.page.html',
  host: { class: 'block' },
})
export class PlayersPage {
  playersFacade = inject(PlayersFacade);

  onOpenPlayer(playerId: string): void {
    this.playersFacade.openPlayer(playerId);
  }

  onRenamePlayer(playerId: string): void {
    this.playersFacade.renamePlayer(playerId);
  }

  onDeletePlayer(playerId: string): void {
    this.playersFacade.deletePlayer(playerId);
  }
}
