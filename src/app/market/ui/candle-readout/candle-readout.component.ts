import { Component, computed, input } from '@angular/core';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { isIntraday } from '@app/market/domain/candle-window';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';

/**
 * Time and open, high, low and close of a candle (crosshair or newest candle); prices in euros,
 * index levels in points without a currency.
 */
@Component({
  selector: 'app-candle-readout',
  imports: [FormatGameDatePipe, FormatGameTimePipe, FormatNumberPipe, FormatPricePipe],
  templateUrl: './candle-readout.component.html',
  host: { class: 'block' },
})
export class CandleReadoutComponent {
  candle = input.required<Candle | null>();
  interval = input.required<CandleResolution>();
  /** Index levels are points, not euros. */
  isIndex = input(false);

  /** Intraday candles show date and time, daily and weekly ones the date. */
  showTime = computed(() => isIntraday(this.interval()));
}
