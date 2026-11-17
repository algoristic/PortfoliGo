import { Component, computed, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { DonutComponent } from '@app/charts/ui/donut/donut.component';
import { DonutSegment } from '@app/charts/ui/donut/donut.model';
import { CHART_COLOR_BACKGROUND_CLASSES } from '@app/charts/ui/models/chart-color.model';
import { regionLabels } from '@app/clock/ui/labels/region-labels';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { RegionId, SectorId } from '@app/world/domain/models/taxonomy.model';

import { sectorLabel } from '../labels/taxonomy-labels';
import { CompositionSegmentView, CompositionView } from '../models/instrument-view.model';

/** A legend row of a split: name, weight and the colour of its segment. */
interface SplitRow {
  key: string;
  label: string;
  weight: number;
  swatchClass: string;
}

interface Split {
  id: 'regions' | 'sectors';
  heading: string;
  segments: DonutSegment[];
  rows: SplitRow[];
  /** Text alternative of the donut: every segment with its weight is in the legend list. */
  label: string;
}

/**
 * Composition of an index or of the index an ETF tracks (US-MK-03): the largest positions with
 * their weight (links to the shares) and the split by region and sector as donuts with a legend
 * that names every segment and its weight, so the donut needs no colour to be read.
 */
@Component({
  selector: 'app-index-composition',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    RouterModule,
    DonutComponent,
    FormatNumberPipe,
    FormatPercentPipe,
  ],
  templateUrl: './index-composition.component.html',
  host: { class: 'block' },
})
export class IndexCompositionComponent {
  composition = input.required<CompositionView>();

  splits = computed((): Split[] => {
    const { regions, sectors } = this.composition();
    return [
      this.#split('regions', this.regionsHeading, regions, (key) => regionLabels(key).label),
      this.#split('sectors', this.sectorsHeading, sectors, sectorLabel),
    ];
  });

  regionsHeading = $localize`:@@uiMarket-indexComposition-regions:Regionen`;
  sectorsHeading = $localize`:@@uiMarket-indexComposition-sectors:Sektoren`;
  otherLabel = $localize`:@@uiMarket-indexComposition-other:Übrige`;

  #split<T extends RegionId | SectorId>(
    id: Split['id'],
    heading: string,
    segments: readonly CompositionSegmentView<T>[],
    label: (key: T) => string,
  ): Split {
    return {
      id,
      heading,
      segments: segments.map((segment) => ({
        id: segment.key,
        value: segment.weight,
        color: segment.color,
      })),
      rows: segments.map((segment) => ({
        key: segment.key,
        label: segment.key === 'other' ? this.otherLabel : label(segment.key),
        weight: segment.weight,
        swatchClass: CHART_COLOR_BACKGROUND_CLASSES[segment.color],
      })),
      label: $localize`:@@uiMarket-indexComposition-donutLabel:Aufteilung nach ${heading}:heading:, Anteile in der Liste daneben`,
    };
  }
}
