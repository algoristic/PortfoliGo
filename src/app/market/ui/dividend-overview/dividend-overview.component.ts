import { Component, input } from '@angular/core';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';

import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';

import { DividendsView } from '../models/instrument-view.model';

/**
 * Dividends of the instrument page (US-MK-03, US-MK-06, TS §6.5): the next ex-date with payment
 * date and amount once announced (ETF distributions are fixed on the ex-date), the payments of
 * the last five years as a table; accumulating ETFs and shares without dividends say so.
 */
@Component({
  selector: 'app-dividend-overview',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    EmptyStateComponent,
    FormatCentsPipe,
    FormatGameDatePipe,
  ],
  templateUrl: './dividend-overview.component.html',
  host: { class: 'block' },
})
export class DividendOverviewComponent {
  dividends = input.required<DividendsView>();

  historyLabel = $localize`:@@uiMarket-dividendOverview-historyLabel:Dividendenhistorie`;
  accumulatingHeading = $localize`:@@uiMarket-dividendOverview-accumulating:Thesaurierender ETF`;
  accumulatingText = $localize`:@@uiMarket-dividendOverview-accumulatingText:Der Fonds schüttet nicht aus, sondern legt seine Erträge wieder an.`;
  noneHeading = $localize`:@@uiMarket-dividendOverview-none:Keine Dividenden`;
  noneText = $localize`:@@uiMarket-dividendOverview-noneText:In den letzten fünf Jahren gab es keine Ausschüttung, und es steht kein Termin fest.`;
}
