import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';

import { MoverView } from '../models/overview-view.model';

/** Gainers or losers of the day (US-MK-01); every row leads to the instrument page. */
@Component({
  selector: 'app-mover-list',
  imports: [RouterModule, FormatPricePipe, PriceChangeComponent, ValueFlashDirective],
  templateUrl: './mover-list.component.html',
  host: { class: 'block' },
})
export class MoverListComponent {
  movers = input.required<readonly MoverView[]>();
  /** Prefix of the `data-testid`s, e.g. `market.overview.gainers`. */
  testId = input.required<string>();
  flashEnabled = input(true);

  emptyText = $localize`:@@uiMarket-moverList-empty:Heute noch keine Veränderungen.`;
}
