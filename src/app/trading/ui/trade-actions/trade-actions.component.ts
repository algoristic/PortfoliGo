import { Component, computed, input, output } from '@angular/core';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';

import { InstrumentTradeView } from '../models/trade-actions.model';

/**
 * „Kaufen“, „Verkaufen“ and „Sparplan anlegen“ of an instrument (US-HD-01, US-HD-02, US-HD-05) with
 * the shares held. Selling needs free shares, a savings plan an eligible instrument; otherwise the
 * button stays focusable with `aria-disabled` and its reason.
 * Indices are not tradable (TS §6.7); the actions then give way to a note.
 */
@Component({
  selector: 'app-trade-actions',
  imports: [ButtonDirective, IconDirective, FormatQuantityPipe],
  templateUrl: './trade-actions.component.html',
  host: { class: 'block' },
})
export class TradeActionsComponent {
  view = input.required<InstrumentTradeView>();

  clickedBuy = output<void>();
  clickedSell = output<void>();
  clickedCreateSavingsPlan = output<void>();

  sellBlocked = computed(() => this.view().free <= 0);
  sellReason = computed(() =>
    this.view().quantity > 0
      ? $localize`:@@uiTrading-tradeActions-allBlocked:Alle Stück sind in offenen Verkaufsorders.`
      : $localize`:@@uiTrading-tradeActions-noPosition:Du hast dieses Wertpapier nicht im Depot.`,
  );

  onBuy(): void {
    this.clickedBuy.emit();
  }

  /** Only eligible instruments have savings plans; the others keep the button with its reason. */
  onCreateSavingsPlan(): void {
    if (this.view().savingsPlanEligible) {
      this.clickedCreateSavingsPlan.emit();
    }
  }

  onSell(): void {
    if (!this.sellBlocked()) {
      this.clickedSell.emit();
    }
  }
}
