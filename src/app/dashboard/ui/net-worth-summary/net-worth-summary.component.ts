import { Component, input } from '@angular/core';

import { PerformanceFigures } from '@app/portfolio/domain/models/performance.model';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

/**
 * Net worth (US-PF-01): the live value, the change today without income and living costs and the
 * change since the start without external flows (TS §7.9), and the split into cash and securities.
 */
@Component({
  selector: 'app-net-worth-summary',
  imports: [PanelComponent, PriceChangeComponent, SkeletonComponent, FormatCentsPipe],
  templateUrl: './net-worth-summary.component.html',
  host: { class: 'block' },
})
export class NetWorthSummaryComponent {
  /** `null` before the first projection. */
  figures = input.required<PerformanceFigures | null>();

  heading = $localize`:@@uiDashboard-netWorthSummary-heading:Gesamtvermögen`;
}
