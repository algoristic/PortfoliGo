import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
} from '@angular/core';
import { RouterModule } from '@angular/router';

import { SparklineComponent } from '@app/charts/ui/sparkline/sparkline.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';

import { WatchlistMove, WatchlistRowView } from '../models/watchlist-view.model';

type MoveDirection = 'up' | 'down';

/**
 * The watchlist (US-MK-04) in the player's order: name and ticker (link to the instrument page),
 * live price (flashing on change) and change, the sparkline of one month from `sm`, and buttons to
 * move a row up or down and to remove it. Rows are dragged by their grip with pointer or touch;
 * the buttons are the keyboard alternative and keep the focus on the moved row.
 */
@Component({
  selector: 'app-watchlist-list',
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    RouterModule,
    SparklineComponent,
    IconButtonDirective,
    IconDirective,
    FormatNumberPipe,
    FormatPricePipe,
    PriceChangeComponent,
    ValueFlashDirective,
  ],
  templateUrl: './watchlist-list.component.html',
  host: { class: 'block' },
})
export class WatchlistListComponent {
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);

  rows = input.required<readonly WatchlistRowView[]>();
  flashEnabled = input(true);

  droppedItem = output<WatchlistMove>();
  movedItem = output<WatchlistMove>();
  clickedRemove = output<string>();

  views = computed(() =>
    this.rows().map((row) => ({
      ...row,
      isIndex: row.kind === 'index',
      upLabel: $localize`:@@uiMarket-watchlistList-moveUp:Nach oben: ${row.name}:name:`,
      downLabel: $localize`:@@uiMarket-watchlistList-moveDown:Nach unten: ${row.name}:name:`,
      removeLabel: $localize`:@@uiMarket-watchlistList-remove:Von der Watchlist entfernen: ${row.name}:name:`,
    })),
  );

  label = $localize`:@@uiMarket-watchlistList-label:Watchlist`;
  dragLabel = $localize`:@@uiMarket-watchlistList-drag:Zum Verschieben ziehen`;

  onDrop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex !== event.currentIndex) {
      this.droppedItem.emit({ from: event.previousIndex, to: event.currentIndex });
    }
  }

  onMove(id: string, index: number, direction: MoveDirection): void {
    const to = direction === 'up' ? index - 1 : index + 1;
    if (to < 0 || to >= this.rows().length) {
      return;
    }
    this.movedItem.emit({ from: index, to });
    // The row moves in the DOM, which can take the focus away: it goes back to the same button.
    afterNextRender(() => this.#focus(id, direction), { injector: this.#injector });
  }

  onRemove(id: string): void {
    this.clickedRemove.emit(id);
  }

  #focus(id: string, direction: MoveDirection): void {
    const row = [
      ...this.#element.nativeElement.querySelectorAll<HTMLElement>(
        '[data-testid="market.watchlist.row"]',
      ),
    ].find((element) => element.dataset['instrumentId'] === id);
    row?.querySelector<HTMLElement>(`[data-testid="market.watchlist.row.${direction}"]`)?.focus();
  }
}
