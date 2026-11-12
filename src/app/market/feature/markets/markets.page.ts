import { Component } from '@angular/core';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

@Component({
  selector: 'app-markets-page',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './markets.page.html',
  host: { class: 'block' },
})
export class MarketsPage {}
