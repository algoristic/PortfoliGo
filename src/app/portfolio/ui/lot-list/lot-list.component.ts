import { Component, computed, input } from '@angular/core';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { TermHintComponent } from '@app/help/ui/term-hint/term-hint.component';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableScrollDirective } from '@app/shared/ui/table/table-scroll.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';

import { LotRow } from '../models/position-detail-view.model';

/**
 * The lots of a position (US-PF-06), oldest first as FIFO sells them: purchase time, shares,
 * acquisition cost per share and in all, and the depot when all depots are shown. A table from
 * `md`, cards below.
 */
@Component({
  selector: 'app-lot-list',
  imports: [
    TableScrollDirective,
    CardDirective,
    TableCellDirective,
    TableDirective,
    TermHintComponent,
    FormatCentsPipe,
    FormatGameTimePipe,
    FormatPricePipe,
    FormatQuantityPipe,
  ],
  templateUrl: './lot-list.component.html',
  host: { class: 'block' },
})
export class LotListComponent {
  lots = input.required<readonly LotRow[]>();
  compact = input(false);

  showDepot = computed(() => this.lots().some((lot) => lot.depot !== null));

  label = $localize`:@@uiPortfolio-lotList-label:Lots`;
}
