import { Component, computed, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import {
  POSITION_SORT_KEYS,
  PositionSort,
  PositionSortKey,
  PositionTotals,
} from '@app/portfolio/domain/models/portfolio.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { SelectDirective } from '@app/shared/ui/select/select.directive';
import { TableScrollDirective } from '@app/shared/ui/table/table-scroll.directive';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';

import { positionColumnLabel } from '../labels/portfolio-labels';
import { PositionRow } from '../models/portfolio-view.model';

type AriaSort = 'ascending' | 'descending' | 'none';

interface SortColumn {
  key: PositionSortKey;
  label: string;
  ariaSort: AriaSort;
  icon: string;
  iconClass: string;
  /** Alignment of header and cells. */
  alignClass: string;
}

interface RowView extends PositionRow {
  buyLabel: string;
  sellLabel: string;
}

/**
 * The positions of the shown depots (US-PF-02): shares, average cost, price (bid without mark-up),
 * value, gain absolute and in %, share of the depot, sortable (`aria-sort`, buttons in the
 * headers) with a sum row and „Kaufen“/„Verkaufen“ per row. `compact` shows cards with a sort
 * choice instead of the table (below `md`).
 */
@Component({
  selector: 'app-position-table',
  imports: [
    TableScrollDirective,
    CardDirective,
    SelectDirective,
    RouterModule,
    ButtonDirective,
    IconDirective,
    FormatCentsPipe,
    FormatPercentPipe,
    FormatPricePipe,
    FormatQuantityPipe,
    PriceChangeComponent,
    ValueFlashDirective,
  ],
  templateUrl: './position-table.component.html',
  host: { class: 'block' },
})
export class PositionTableComponent {
  rows = input.required<PositionRow[]>();
  totals = input.required<PositionTotals>();
  sort = input.required<PositionSort>();
  compact = input(false);
  flashEnabled = input(true);

  selectedSort = output<PositionSortKey>();
  clickedBuy = output<PositionRow>();
  clickedSell = output<PositionRow>();

  columns = computed((): SortColumn[] => {
    const sort = this.sort();
    return POSITION_SORT_KEYS.map((key) => {
      const ariaSort: AriaSort = sort.key === key ? sort.direction : 'none';
      return {
        key,
        label: positionColumnLabel(key),
        ariaSort,
        icon:
          ariaSort === 'ascending'
            ? 'arrow-up'
            : ariaSort === 'descending'
              ? 'arrow-down'
              : 'arrow-down-up',
        iconClass: ariaSort === 'none' ? 'text-xs text-fg-muted' : 'text-xs text-accent',
        alignClass: key === 'name' ? 'text-left' : 'text-right',
      };
    });
  });
  sortedColumn = computed(
    () => this.columns().find((column) => column.key === this.sort().key) ?? this.columns()[0],
  );
  rowViews = computed((): RowView[] =>
    this.rows().map((row) => ({
      ...row,
      buyLabel: $localize`:@@uiPortfolio-positionTable-buyLabel:${row.name}:name: kaufen`,
      sellLabel: $localize`:@@uiPortfolio-positionTable-sellLabel:${row.name}:name: verkaufen`,
    })),
  );
  /** The sum row shows 100 % once the values are known. */
  totalShare = computed(() => ((this.totals().value ?? 0) > 0 ? 1 : null));
  directionLabel = computed(() =>
    this.sort().direction === 'ascending'
      ? $localize`:@@uiPortfolio-positionTable-ascending:Aufsteigend, umkehren`
      : $localize`:@@uiPortfolio-positionTable-descending:Absteigend, umkehren`,
  );

  label = $localize`:@@uiPortfolio-positionTable-label:Positionen`;
  sortLabel = $localize`:@@uiPortfolio-positionTable-sortLabel:Sortieren nach`;

  onSort(key: PositionSortKey): void {
    this.selectedSort.emit(key);
  }

  onSelectSortKey(event: Event): void {
    const key = (event.target as HTMLSelectElement).value as PositionSortKey;
    if (key !== this.sort().key) {
      this.selectedSort.emit(key);
    }
  }

  onReverse(): void {
    this.selectedSort.emit(this.sort().key);
  }

  onBuy(row: PositionRow): void {
    this.clickedBuy.emit(row);
  }

  onSell(row: PositionRow): void {
    this.clickedSell.emit(row);
  }
}
