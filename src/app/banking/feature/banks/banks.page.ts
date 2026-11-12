import { Component } from '@angular/core';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

@Component({
  selector: 'app-banks-page',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './banks.page.html',
  host: { class: 'block' },
})
export class BanksPage {}
