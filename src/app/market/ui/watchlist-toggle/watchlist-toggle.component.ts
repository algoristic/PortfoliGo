import { Component, computed, input, output } from '@angular/core';

import { MAX_WATCHLIST_LENGTH } from '@app/market/domain/models/watchlist.model';
import { ButtonSize } from '@app/shared/ui/button/button.model';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';

/**
 * Star button that puts an instrument on the watchlist or takes it off (US-MK-04), a toggle with
 * `aria-pressed`. With a full list it can't add and says why; it stays focusable
 * (`aria-disabled`), so the reason stays readable.
 */
@Component({
  selector: 'app-watchlist-toggle',
  imports: [IconButtonDirective, IconDirective],
  templateUrl: './watchlist-toggle.component.html',
  host: { class: 'inline-flex' },
})
export class WatchlistToggleComponent {
  name = input.required<string>();
  watched = input.required<boolean>();
  full = input(false);
  /** The list is not known yet: nothing can change. */
  disabled = input(false);
  size = input<ButtonSize>('md');
  testId = input('market.watchlist-toggle');

  toggledWatchlist = output<boolean>();

  blocked = computed(() => this.disabled() || (this.full() && !this.watched()));
  label = computed(() =>
    this.full() && !this.watched()
      ? $localize`:@@uiMarket-watchlistToggle-full:Auf der Watchlist: ${this.name()}:name: – die Watchlist ist voll (höchstens ${MAX_WATCHLIST_LENGTH}:maxLength: Wertpapiere)`
      : $localize`:@@uiMarket-watchlistToggle-label:Auf der Watchlist: ${this.name()}:name:`,
  );

  onClick(): void {
    if (!this.blocked()) {
      this.toggledWatchlist.emit(!this.watched());
    }
  }
}
