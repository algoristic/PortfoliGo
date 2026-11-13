import { Component, computed, input } from '@angular/core';

import { regionLabels, regionStatusText } from '@app/clock/ui/labels/region-labels';
import { RegionStatusEntry } from '@app/clock/ui/market-status/market-status.model';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

/**
 * Trading status per region on the markets page (US-MK-01, US-MK-05): open or closed with the next
 * change, and a note when every exchange is closed, because prices stand still then. Open and
 * closed differ in the icon shape, not only in colour, as in the header.
 */
@Component({
  selector: 'app-region-sessions',
  imports: [IconDirective],
  templateUrl: './region-sessions.component.html',
  host: { class: 'block' },
})
export class RegionSessionsComponent {
  regions = input.required<readonly RegionStatusEntry[]>();

  rows = computed(() =>
    this.regions().map((region) => ({
      regionId: region.regionId,
      open: region.status.open,
      label: regionLabels(region.regionId).label,
      state: region.status.open ? this.openLabel : this.closedLabel,
      statusText: regionStatusText(region.status),
    })),
  );
  allClosed = computed(
    () => this.regions().length > 0 && this.regions().every((region) => !region.status.open),
  );

  openLabel = $localize`:@@uiMarket-regionSessions-open:Geöffnet`;
  closedLabel = $localize`:@@uiMarket-regionSessions-closed:Geschlossen`;
}
