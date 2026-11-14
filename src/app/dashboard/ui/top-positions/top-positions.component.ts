import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';

import { TopPositionEntry } from '../models/dashboard-view.model';

/** The largest positions by value (PS §10.3) with share and gain, linked to their detail. */
@Component({
  selector: 'app-top-positions',
  imports: [
    RouterLink,
    PanelComponent,
    EmptyStateComponent,
    PriceChangeComponent,
    FormatCentsPipe,
    FormatPercentPipe,
  ],
  templateUrl: './top-positions.component.html',
  host: { class: 'block' },
})
export class TopPositionsComponent {
  positions = input.required<TopPositionEntry[]>();

  heading = $localize`:@@uiDashboard-topPositions-heading:Top-Positionen`;
}
