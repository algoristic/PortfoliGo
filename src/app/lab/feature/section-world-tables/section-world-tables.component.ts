import { Component, input } from '@angular/core';

import { TabPanelDirective } from '../../../shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '../../../shared/ui/tabs/tabs.component';
import { TabItem } from '../../../shared/ui/tabs/tabs.model';
import { formatCompact, formatPercent, formatPrice } from '../../../shared/util/format';
import { WorldOverview } from '../../domain/models/world-overview.model';

/** Companies, indices, ETFs and banks of the generated world; codes are shown as they are. */
@Component({
  selector: 'app-section-world-tables',
  imports: [TabPanelDirective, TabsComponent],
  templateUrl: './section-world-tables.component.html',
  styleUrl: './section-world-tables.component.scss',
})
export class SectionWorldTablesComponent {
  overview = input.required<WorldOverview>();

  formatCompact = formatCompact;
  formatPercent = formatPercent;
  formatPrice = formatPrice;

  tabs: TabItem[] = [
    {
      id: 'companies',
      label: $localize`:@@featureLab-sectionWorldTables-tabCompanies:Unternehmen`,
    },
    { id: 'indices', label: $localize`:@@featureLab-sectionWorldTables-tabIndices:Indizes` },
    { id: 'etfs', label: $localize`:@@featureLab-sectionWorldTables-tabEtfs:ETFs` },
    { id: 'banks', label: $localize`:@@featureLab-sectionWorldTables-tabBanks:Banken` },
  ];
  tabsLabel = $localize`:@@featureLab-sectionWorldTables-tabsLabel:Welt`;
}
