import { Component, computed, input } from '@angular/core';

import { PositionTotals } from '@app/portfolio/domain/models/portfolio.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { StatTileComponent } from '@app/shared/ui/stat-tile/stat-tile.component';
import { formatCents, formatOptional, formatSignedCents } from '@app/shared/util/format';

interface SummaryTile {
  id: 'value' | 'cost' | 'gain' | 'cash';
  label: string;
  value: string;
  change?: number;
}

/** Key figures of the shown depots (US-PF-02): value, acquisition cost, gain and money. */
@Component({
  selector: 'app-portfolio-summary',
  imports: [StatTileComponent],
  templateUrl: './portfolio-summary.component.html',
  host: { class: 'block' },
})
export class PortfolioSummaryComponent {
  totals = input.required<PositionTotals>();
  cash = input.required<Cents>();
  /** All depots: the money on all open accounts; one depot: its clearing account. */
  combined = input.required<boolean>();

  tiles = computed((): SummaryTile[] => {
    const { value, cost, gain, gainRatio } = this.totals();
    return [
      {
        id: 'value',
        label: $localize`:@@uiPortfolio-portfolioSummary-value:Depotwert`,
        value: formatOptional(value, formatCents),
      },
      {
        id: 'cost',
        label: $localize`:@@uiPortfolio-portfolioSummary-cost:Einstandswert`,
        value: formatCents(cost),
      },
      {
        id: 'gain',
        label: $localize`:@@uiPortfolio-portfolioSummary-gain:Gewinn/Verlust`,
        value: formatOptional(gain, formatSignedCents),
        ...(gainRatio === null ? {} : { change: gainRatio }),
      },
      {
        id: 'cash',
        label: this.combined()
          ? $localize`:@@uiPortfolio-portfolioSummary-cashAll:Liquidität (alle Konten)`
          : $localize`:@@uiPortfolio-portfolioSummary-cashDepot:Verrechnungskonto`,
        value: formatCents(this.cash()),
      },
    ];
  });
}
