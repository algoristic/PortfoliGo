import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { DisclaimerHintComponent } from '@app/about/ui/disclaimer-hint/disclaimer-hint.component';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { FormNewPlayerComponent } from '../../ui/form-new-player/form-new-player.component';
import { PlayersFacade } from '../state/players.facade';

@Component({
  selector: 'app-new-player-page',
  imports: [
    CommonModule,
    PanelComponent,
    SkeletonComponent,
    FormNewPlayerComponent,
    DisclaimerHintComponent,
  ],
  templateUrl: './new-player.page.html',
  host: { class: 'block' },
})
export class NewPlayerPage {
  playersFacade = inject(PlayersFacade);

  onSuggestSeed(): void {
    this.playersFacade.suggestSeed();
  }

  onSubmitNewPlayer(newPlayer: NewPlayer): void {
    this.playersFacade.createPlayer(newPlayer);
  }
}
