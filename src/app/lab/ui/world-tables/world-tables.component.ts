import { Component, input } from '@angular/core';

import { FormatCompactPipe } from '@app/shared/ui/pipes/format-compact/format-compact.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { TabPanelDirective } from '@app/shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '@app/shared/ui/tabs/tabs.component';
import { TabItem } from '@app/shared/ui/tabs/tabs.model';

import { WorldOverview } from '../../domain/models/world-overview.model';

/** Companies, indices, ETFs and banks of the generated world; codes are shown as they are. */
@Component({
  selector: 'app-world-tables',
  imports: [
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
}
