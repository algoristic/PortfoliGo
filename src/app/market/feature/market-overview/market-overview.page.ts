import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import { IndexOverviewComponent } from '@app/market/ui/index-overview/index-overview.component';
import { MoverListComponent } from '@app/market/ui/mover-list/mover-list.component';
import { RegionSessionsComponent } from '@app/market/ui/region-sessions/region-sessions.component';
import { SectorHeatmapComponent } from '@app/market/ui/sector-heatmap/sector-heatmap.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { MarketFacade } from '../state/market.facade';

/**
 * Markets overview (US-MK-01): indices with the line of the day, trading status per region,
 * gainers and losers and the sectors as a heat map; prices update live (US-MK-05).
 */
@Component({
  selector: 'app-market-overview-page',
  imports: [
    CommonModule,
    PanelComponent,
    SkeletonComponent,
    IndexOverviewComponent,
    MoverListComponent,
    RegionSessionsComponent,
    SectorHeatmapComponent,
  ],
  templateUrl: './market-overview.page.html',
  host: { class: 'block' },
})
export class MarketOverviewPage {
  facade = inject(MarketFacade);
  clockFacade = inject(ClockFacade);

  indicesHeading = $localize`:@@featureMarket-marketOverviewPage-indices:Indizes`;
  sessionsHeading = $localize`:@@featureMarket-marketOverviewPage-sessions:Börsenstatus`;
  gainersHeading = $localize`:@@featureMarket-marketOverviewPage-gainers:Gewinner des Tages`;
  losersHeading = $localize`:@@featureMarket-marketOverviewPage-losers:Verlierer des Tages`;
  sectorsHeading = $localize`:@@featureMarket-marketOverviewPage-sectors:Sektoren`;
}
