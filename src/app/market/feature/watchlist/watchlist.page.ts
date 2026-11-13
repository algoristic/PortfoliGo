import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { WatchlistMove, WatchlistRowView } from '@app/market/ui/models/watchlist-view.model';
import { WatchlistListComponent } from '@app/market/ui/watchlist-list/watchlist-list.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { MarketFacade } from '../state/market.facade';

/**
 * Watchlist tab of the markets area (US-MK-04): the player's instruments in their order with live
 * prices; rows are dragged or moved with buttons, removed, and lead to the instrument page. A move
 * is announced to screen readers.
 */
@Component({
  selector: 'app-watchlist-page',
  imports: [
    CommonModule,
    RouterModule,
    PanelComponent,
    EmptyStateComponent,
    ButtonDirective,
    WatchlistListComponent,
  ],
  templateUrl: './watchlist.page.html',
  host: { class: 'block' },
})
export class WatchlistPage {
  facade = inject(MarketFacade);
  readonly #announcer = inject(LiveAnnouncer);

  onDrop(move: WatchlistMove, rows: readonly WatchlistRowView[]): void {
    this.facade.dropWatchlistItem(move.from, move.to);
    this.#announceMove(move, rows);
  }

  onMove(move: WatchlistMove, rows: readonly WatchlistRowView[]): void {
    this.facade.moveWatchlistItem(move.from, move.to);
    this.#announceMove(move, rows);
  }

  onRemove(id: string): void {
    this.facade.removeFromWatchlist(id);
  }

  #announceMove({ from, to }: WatchlistMove, rows: readonly WatchlistRowView[]): void {
    const row = rows[from];
    if (row === undefined) {
      return;
    }
    void this.#announcer.announce(
      $localize`:@@featureMarket-watchlistPage-moved:${row.name}:name: steht jetzt auf Platz ${to + 1}:position: von ${rows.length}:count:.`,
    );
  }
}
