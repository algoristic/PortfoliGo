import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

@Component({
  selector: 'app-players-page',
  imports: [RouterModule, PanelComponent, EmptyStateComponent, ButtonDirective],
  templateUrl: './players.page.html',
  host: { class: 'block' },
})
export class PlayersPage {}
