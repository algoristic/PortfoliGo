import { Component, computed, input } from '@angular/core';

import { exchangeChangeText } from '@app/clock/ui/labels/region-labels';
import { FormatGameWeekdayTimePipe } from '@app/clock/ui/pipes/format-game-weekday-time/format-game-weekday-time.pipe';
import { TermHintComponent } from '@app/help/ui/term-hint/term-hint.component';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatFixedPricePipe } from '@app/shared/ui/pipes/format-fixed-price/format-fixed-price.pipe';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatSignedPricePipe } from '@app/shared/ui/pipes/format-signed-price/format-signed-price.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';
import { ChangeDirection, changeDirection } from '@app/shared/util/change-direction';

import { instrumentKindLabel } from '../labels/taxonomy-labels';
import { InstrumentHeadView } from '../models/instrument-view.model';
import { FormatSignedNumberPipe } from '../pipes/format-signed-number/format-signed-number.pipe';

const DIRECTION_CLASSES: Record<ChangeDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-fg-muted',
};

/**
 * Price head of the instrument page (US-MK-03, US-MK-05): name, ticker, ISIN, exchange and kind;
 * last price (flashes on changes), change in euros (points for indices) and percent, bid, ask and
 * spread (not for indices, they aren't tradable), the indicative value of ETFs and the trading
 * status with the next change; a note while the exchange is closed, because prices stand still.
 * Actions (watchlist star) go into the title row as content.
 */
@Component({
  selector: 'app-instrument-quote',
  imports: [
    TermHintComponent,
    BadgeComponent,
    IconDirective,
    FormatFixedPricePipe,
    FormatGameWeekdayTimePipe,
    FormatNumberPipe,
    FormatPercentPipe,
    FormatPricePipe,
    FormatSignedNumberPipe,
    FormatSignedPricePipe,
    PriceChangeComponent,
    ValueFlashDirective,
  ],
  templateUrl: './instrument-quote.component.html',
  host: { class: 'block' },
})
export class InstrumentQuoteComponent {
  head = input.required<InstrumentHeadView>();
  flashEnabled = input(true);

  kindLabel = computed(() => instrumentKindLabel(this.head().kind));
  isIndex = computed(() => this.head().kind === 'index');
  changeClass = computed(() => {
    const { change, priceDecimals } = this.head();
    return DIRECTION_CLASSES[change === null ? 'flat' : changeDirection(change, priceDecimals)];
  });
  statusText = computed(() => {
    const status = this.head().status;
    if (status === null) {
      return null;
    }
    const state = status.open ? this.openLabel : this.closedLabel;
    return `${state} · ${exchangeChangeText(status)}`;
  });
  closed = computed(() => this.head().status?.open === false);

  openLabel = $localize`:@@uiMarket-instrumentQuote-open:Geöffnet`;
  closedLabel = $localize`:@@uiMarket-instrumentQuote-closed:Geschlossen`;
  lastLabel = $localize`:@@uiMarket-instrumentQuote-last:Letzter Kurs`;
  levelLabel = $localize`:@@uiMarket-instrumentQuote-level:Stand`;
  changeLabel = $localize`:@@uiMarket-instrumentQuote-change:Veränderung zum Vortag`;
}
