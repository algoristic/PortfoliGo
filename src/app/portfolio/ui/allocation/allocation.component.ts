import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { DonutComponent } from '@app/charts/ui/donut/donut.component';
import { DonutSegment } from '@app/charts/ui/donut/donut.model';
import {
  CHART_COLOR_BACKGROUND_CLASSES,
  CHART_COLORS,
  ChartColor,
} from '@app/charts/ui/models/chart-color.model';
import { AllocationEntry } from '@app/portfolio/domain/models/allocation.model';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { TabPanelDirective } from '@app/shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '@app/shared/ui/tabs/tabs.component';
import { TabItem } from '@app/shared/ui/tabs/tabs.model';

import { assetClassLabel, regionKeyLabel, sectorKeyLabel } from '../labels/portfolio-labels';
import { PortfolioAllocation } from '../models/portfolio-view.model';

type Dimension = 'asset-class' | 'region' | 'sector';

interface LegendRow {
  key: string;
  label: string;
  value: number;
  share: number;
  swatchClass: string;
}

interface Split {
  id: Dimension;
  heading: string;
  segments: DonutSegment[];
  rows: LegendRow[];
  /** Text alternative of the donut: every part with its share is in the table beside it. */
  label: string;
  /** Regions and sectors wait for the compositions of the ETFs. */
  pending: boolean;
}

/**
 * Allocation of the shown depots (US-PF-03) by asset class, region and sector, each as a donut
 * with a table of every part, its value and share. ETFs count with the regions and sectors of their
 * index (look-through, E-28). With more than six parts the donut joins the smallest into „Übrige“
 * (their rows in the table share its colour).
 */
@Component({
  selector: 'app-allocation',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    NgTemplateOutlet,
    DonutComponent,
    FormatCentsPipe,
    FormatPercentPipe,
    SkeletonComponent,
    TabPanelDirective,
    TabsComponent,
  ],
  templateUrl: './allocation.component.html',
  host: { class: 'block' },
})
export class AllocationComponent {
  allocation = input.required<PortfolioAllocation>();

  splits = computed((): Split[] => {
    const { assetClasses, regions, sectors, lookThroughPending } = this.allocation();
    return [
      this.#split('asset-class', this.tabs[0].label, assetClasses, assetClassLabel, false),
      this.#split('region', this.tabs[1].label, regions, regionKeyLabel, lookThroughPending),
      this.#split('sector', this.tabs[2].label, sectors, sectorKeyLabel, lookThroughPending),
    ];
  });

  tabs: TabItem[] = [
    { id: 'asset-class', label: $localize`:@@uiPortfolio-allocation-assetClass:Assetklasse` },
    { id: 'region', label: $localize`:@@uiPortfolio-allocation-region:Region` },
    { id: 'sector', label: $localize`:@@uiPortfolio-allocation-sector:Sektor` },
  ];
  tabsLabel = $localize`:@@uiPortfolio-allocation-tabsLabel:Aufteilung nach`;

  #split<K extends string>(
    id: Dimension,
    heading: string,
    entries: readonly AllocationEntry<K>[],
    label: (key: K) => string,
    pending: boolean,
  ): Split {
    const fits = entries.length <= CHART_COLORS.length;
    const colorOf = (index: number): ChartColor =>
      CHART_COLORS[fits ? index : Math.min(index, CHART_COLORS.length - 1)];
    const shown = fits ? entries : entries.slice(0, CHART_COLORS.length - 1);
    const segments: DonutSegment[] = shown.map((entry, index) => ({
      id: entry.key,
      value: entry.value,
      color: colorOf(index),
    }));
    if (!fits) {
      segments.push({
        id: 'other',
        value: entries.slice(CHART_COLORS.length - 1).reduce((sum, entry) => sum + entry.value, 0),
        color: CHART_COLORS[CHART_COLORS.length - 1],
      });
    }
    return {
      id,
      heading,
      segments,
      rows: entries.map((entry, index) => ({
        key: entry.key,
        label: label(entry.key),
        value: entry.value,
        share: entry.share,
        swatchClass: CHART_COLOR_BACKGROUND_CLASSES[colorOf(index)],
      })),
      label: $localize`:@@uiPortfolio-allocation-donutLabel:Aufteilung nach ${heading}:heading:, Anteile in der Tabelle daneben`,
      pending,
    };
  }
}
