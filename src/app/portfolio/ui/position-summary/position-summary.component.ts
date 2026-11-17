import { Component, input } from '@angular/core';

import { PositionDetail } from '@app/portfolio/domain/models/position-detail.model';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';
import { FormatSignedCentsPipe } from '@app/shared/ui/pipes/format-signed-cents/format-signed-cents.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';

/**
 * Key figures of a position (US-PF-06): shares, average cost, acquisition cost, value at the bid
 * without mark-up, unrealized gain with its ratio, realized gain and distributions so far.
 */
@Component({
  selector: 'app-position-summary',
  imports: [
    CardDirective,
    FormatCentsPipe,
    FormatPricePipe,
    FormatQuantityPipe,
    FormatSignedCentsPipe,
    PriceChangeComponent,
    ValueFlashDirective,
  ],
  templateUrl: './position-summary.component.html',
  host: { class: 'block' },
})
export class PositionSummaryComponent {
  detail = input.required<PositionDetail>();
}
