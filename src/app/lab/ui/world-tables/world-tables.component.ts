import { Component, computed, input, output } from '@angular/core';

import { FormatCompactPipe } from '@app/shared/ui/pipes/format-compact/format-compact.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { TabPanelDirective } from '@app/shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '@app/shared/ui/tabs/tabs.component';
import { TabItem } from '@app/shared/ui/tabs/tabs.model';

import { WorldOverview } from '../../domain/models/world-overview.model';

/**
 * Companies, indices, ETFs and banks of the generated world; codes are shown as they are. A click
 * on a share, index or ETF row emits its series (an index opens its price index).
 */
@Component({
  selector: 'app-world-tables',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    FormatCompactPipe,
    FormatPercentPipe,
    FormatPricePipe,
    TabPanelDirective,
    TabsComponent,
  ],
  templateUrl: './world-tables.component.html',
  host: { class: 'block' },
})
export class WorldTablesComponent {
  overview = input.required<WorldOverview>();

  selectedSeries = output<number>();

  seriesById = computed(
    () =>
      new Map(
        this.overview()
          .series.filter((option) => option.kind !== 'total-return')
          .map((option) => [option.id, option.series]),
      ),
  );

  tabs: TabItem[] = [
    {
      id: 'companies',
      label: $localize`:@@uiLab-worldTables-tabCompanies:Unternehmen`,
    },
    { id: 'indices', label: $localize`:@@uiLab-worldTables-tabIndices:Indizes` },
    { id: 'etfs', label: $localize`:@@uiLab-worldTables-tabEtfs:ETFs` },
    { id: 'banks', label: $localize`:@@uiLab-worldTables-tabBanks:Banken` },
  ];
  tabsLabel = $localize`:@@uiLab-worldTables-tabsLabel:Welt`;
  openLabel = $localize`:@@uiLab-worldTables-openInChart:Im Chart öffnen`;

  onSelectRow(id: string): void {
    const series = this.seriesById().get(id);
    if (series !== undefined) {
      this.selectedSeries.emit(series);
    }
  }
}
