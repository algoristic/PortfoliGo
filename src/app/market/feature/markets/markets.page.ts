import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-markets',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './markets.page.html',
  styleUrl: './markets.page.scss',
})
export class MarketsPage {}
