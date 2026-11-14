import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { focusIfLost } from '@app/shared/ui/focus/focus-if-lost';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
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
    FormatPercentPipe,
  ],
  templateUrl: './players.page.html',
  host: { class: 'block' },
})
export class PlayersPage {
  playersFacade = inject(PlayersFacade);
  readonly #injector = inject(Injector);

  createLink = viewChild<ElementRef<HTMLElement>>('createLink');

  #importRatio = toSignal(this.playersFacade.importRatio$, { initialValue: null });
  importPercent = computed(() => {
    const ratio = this.#importRatio();
    return ratio === null ? null : Math.round(ratio * 100);
  });

  #playerCount = toSignal(this.playersFacade.players$.pipe(map((players) => players.length)), {
    initialValue: 0,
  });

  importProgressLabel = $localize`:@@featurePlayers-playersPage-importProgressLabel:Fortschritt des Imports`;

  constructor() {
    // Deleting a player removes the focused row. „Neuer Spieler“ exists with and without players,
    // so the focus goes there instead of falling back to `<body>`.
    let previousCount = 0;
    effect(() => {
      const count = this.#playerCount();
      if (count < previousCount) {
        focusIfLost(this.#injector, () => this.createLink()?.nativeElement);
      }
      previousCount = count;
    });
  }

  onImportPlayer(): void {
    this.playersFacade.importPlayer();
  }

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
