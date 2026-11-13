import { Component, computed, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { HeatLevel } from '@app/market/domain/heatmap-logic';
import { FormatSignedPercentPipe } from '@app/shared/ui/pipes/format-signed-percent/format-signed-percent.pipe';

import { sectorLabel } from '../labels/taxonomy-labels';
import { SectorHeatView } from '../models/overview-view.model';

/**
 * Background per level: the direction token with growing opacity. Text stays `text-fg`, which keeps
 * at least 4.5:1 on every level in both themes (lowest 5.3:1 at `bg-up/50` in the dark theme).
 */
const LEVEL_CLASSES: Record<HeatLevel, string> = {
  [-4]: 'bg-down/50',
  [-3]: 'bg-down/35',
  [-2]: 'bg-down/20',
  [-1]: 'bg-down/10',
  0: 'bg-surface-raised',
  1: 'bg-up/10',
  2: 'bg-up/20',
  3: 'bg-up/35',
  4: 'bg-up/50',
};

/**
 * Daily change of the sectors as a heat map (US-MK-01): one tile per sector index with name and
 * change; the sign tells the direction without colour. A tile leads to its sector index.
 */
@Component({
  selector: 'app-sector-heatmap',
  imports: [RouterModule, FormatSignedPercentPipe],
  templateUrl: './sector-heatmap.component.html',
  host: { class: 'block' },
})
export class SectorHeatmapComponent {
  sectors = input.required<readonly SectorHeatView[]>();

  tiles = computed(() =>
    this.sectors().map((sector) => ({
      ...sector,
      label: sectorLabel(sector.sectorId),
      tileClass: LEVEL_CLASSES[sector.level],
    })),
  );
}
