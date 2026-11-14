import { Component, computed, input } from '@angular/core';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';

import { tradeSideLabel } from '../labels/portfolio-labels';
import { TradeRow } from '../models/position-detail-view.model';

interface TradeRowView extends TradeRow {
  sideLabel: string;
}

/**
 * Executed purchases and sales of a position (US-PF-06), newest first, savings plan purchases
 * included: time, kind, depot when all
 * depots are shown, shares, price, costs (order and exchange fee) and the debit or credit. A table
 * from `md`, cards below.
 */
@Component({
  selector: 'app-trade-list',
  imports: [FormatCentsPipe, FormatGameTimePipe, FormatPricePipe, FormatQuantityPipe],
  templateUrl: './trade-list.component.html',
  host: { class: 'block' },
})
export class TradeListComponent {
  trades = input.required<readonly TradeRow[]>();
  compact = input(false);

  rows = computed((): TradeRowView[] =>
    this.trades().map((trade) => ({
      ...trade,
      sideLabel: tradeSideLabel(trade.side, trade.savingsPlan),
    })),
  );
  showDepot = computed(() => this.trades().some((trade) => trade.depot !== null));

  label = $localize`:@@uiPortfolio-tradeList-label:Käufe und Verkäufe`;
}
