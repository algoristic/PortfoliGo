import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-players',
  imports: [RouterModule, PanelComponent, EmptyStateComponent, ButtonDirective],
  templateUrl: './players.page.html',
  styleUrl: './players.page.scss',
})
export class PlayersPage {}
