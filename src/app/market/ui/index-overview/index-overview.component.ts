import { Component, computed, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SparklineComponent } from '@app/charts/ui/sparkline/sparkline.component';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';
import { ChangeDirection, changeDirection } from '@app/shared/util/change-direction';

import { OverviewIndexView } from '../models/overview-view.model';
import { FormatSignedNumberPipe } from '../pipes/format-signed-number/format-signed-number.pipe';

const DIRECTION_CLASSES: Record<ChangeDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-fg-muted',
};

/**
 * The indices of the markets page (US-MK-01): level, daily change in points and percent and the
 * line of the trading day against the previous close. Changes of the level flash (US-MK-05).
 */
@Component({
  selector: 'app-index-overview',
  imports: [
    RouterModule,
    SparklineComponent,
    FormatNumberPipe,
    FormatSignedNumberPipe,
    PriceChangeComponent,
    SkeletonComponent,
    ValueFlashDirective,
  ],
  templateUrl: './index-overview.component.html',
  host: { class: 'block' },
})
export class IndexOverviewComponent {
  indices = input.required<readonly OverviewIndexView[]>();
  flashEnabled = input(true);

  cards = computed(() =>
    this.indices().map(({ instrument, quote, sparkline }) => ({
      id: instrument.id,
      name: instrument.name,
      ticker: instrument.ticker,
      quote,
      sparkline,
      changeClass:
        quote === null
          ? DIRECTION_CLASSES.flat
          : DIRECTION_CLASSES[changeDirection(quote.change, 2)],
      sparklineLabel: $localize`:@@uiMarket-indexOverview-sparklineLabel:Tagesverlauf ${instrument.name}:name:`,
    })),
  );

  levelLabel = $localize`:@@uiMarket-indexOverview-level:Stand`;
}
