import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { Component, computed, effect, input, output, untracked, viewChild } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SparklineComponent } from '@app/charts/ui/sparkline/sparkline.component';
import { ScreenerSort, ScreenerSortKey } from '@app/market/domain/models/screener.model';
import { PerformancePeriod } from '@app/market/domain/performance-logic';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatSignedPercentPipe } from '@app/shared/ui/pipes/format-signed-percent/format-signed-percent.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';

import { AriaSort, ScreenerPeriodLabel, ScreenerSortButton } from './screener-list.model';

import { instrumentKindLabel } from '../labels/taxonomy-labels';
import { ScreenerRange, ScreenerRowView } from '../models/screener-view.model';
import { WatchlistMembership, WatchlistToggle } from '../models/watchlist-view.model';
import { WatchlistToggleComponent } from '../watchlist-toggle/watchlist-toggle.component';

/** Height of a row in px: `h-14` in the template, the item size of the virtual scrolling. */
const ROW_HEIGHT_PX = 56;
/** Rows assumed visible while the viewport has not measured its size yet. */
const FALLBACK_VISIBLE_ROWS = 20;

/**
 * Matches of the screener (US-MK-02) with virtual scrolling: name, ticker and kind, price and
 * change (live for the watched rows, flashing on change), the sparkline of one month, the
 * performance of the sorted period (one year otherwise), the dividend yield and, with `watchlist`,
 * a star that puts the instrument on the watchlist (US-MK-04). The head sorts;
 * on phones a row shows name, price and change, the rest from `md`.
 */
@Component({
  selector: 'app-screener-list',
  imports: [
    ScrollingModule,
    RouterModule,
    SparklineComponent,
    IconDirective,
    FormatNumberPipe,
    FormatPercentPipe,
    FormatPricePipe,
    FormatSignedPercentPipe,
    PriceChangeComponent,
    ValueFlashDirective,
    WatchlistToggleComponent,
  ],
  templateUrl: './screener-list.component.html',
  host: { class: 'block' },
})
export class ScreenerListComponent {
  rows = input.required<readonly ScreenerRowView[]>();
  total = input<number | null>(null);
  sort = input.required<ScreenerSort>();
  performancePeriod = input.required<PerformancePeriod>();
  /** The list scrolls to the top when this changes (a new query). */
  resetKey = input<unknown>();
  flashEnabled = input(true);
  /** The star of every row; without it the list shows none. */
  watchlist = input<WatchlistMembership | null>(null);

  rowHeight = ROW_HEIGHT_PX;

  clickedSort = output<ScreenerSortKey>();
  changedRange = output<ScreenerRange>();
  toggledWatchlist = output<WatchlistToggle>();

  viewport = viewChild(CdkVirtualScrollViewport);

  periods: ScreenerPeriodLabel[] = [
    {
      period: 'm1',
      short: $localize`:@@uiMarket-screenerList-m1:1M`,
      long: $localize`:@@uiMarket-screenerList-m1Long:Performance 1 Monat`,
    },
    {
      period: 'm6',
      short: $localize`:@@uiMarket-screenerList-m6:6M`,
      long: $localize`:@@uiMarket-screenerList-m6Long:Performance 6 Monate`,
    },
    {
      period: 'y1',
      short: $localize`:@@uiMarket-screenerList-y1:1J`,
      long: $localize`:@@uiMarket-screenerList-y1Long:Performance 1 Jahr`,
    },
    {
      period: 'y5',
      short: $localize`:@@uiMarket-screenerList-y5:5J`,
      long: $localize`:@@uiMarket-screenerList-y5Long:Performance 5 Jahre`,
    },
  ];

  nameSort = computed(() => this.#button('name', this.nameLabel, null));
  changeSort = computed(() => this.#button('changeRatio', this.changeLabel, null));
  yieldSort = computed(() => this.#button('dividendYield', this.yieldShortLabel, this.yieldLabel));
  periodSorts = computed(() =>
    this.periods.map(({ period, short, long }) => this.#button(period, short, long)),
  );
  performanceAriaSort = computed((): AriaSort => {
    const active = this.periodSorts().find((button) => button.active);
    return active?.ariaSort ?? 'none';
  });
  performanceShort = computed(
    () => this.periods.find(({ period }) => period === this.performancePeriod())?.short ?? '',
  );
  views = computed(() => {
    const watched = this.watchlist()?.ids;
    return this.rows().map((row) => ({
      ...row,
      kindLabel: instrumentKindLabel(row.kind),
      isIndex: row.kind === 'index',
      watched: watched?.has(row.id) ?? false,
    }));
  });

  label = $localize`:@@uiMarket-screenerList-label:Trefferliste`;
  nameLabel = $localize`:@@uiMarket-screenerList-name:Name`;
  priceLabel = $localize`:@@uiMarket-screenerList-price:Kurs`;
  changeLabel = $localize`:@@uiMarket-screenerList-change:Veränderung`;
  trendLabel = $localize`:@@uiMarket-screenerList-trend:Verlauf 1M`;
  performanceLabel = $localize`:@@uiMarket-screenerList-performance:Performance`;
  yieldLabel = $localize`:@@uiMarket-screenerList-yield:Dividendenrendite`;
  yieldShortLabel = $localize`:@@uiMarket-screenerList-yieldShort:Div.-Rendite`;
  watchlistLabel = $localize`:@@uiMarket-screenerList-watchlist:Watchlist`;
  emptyText = $localize`:@@uiMarket-screenerList-empty:Keine Treffer. Ändere die Suche oder setze die Filter zurück.`;

  #scrollToTop = effect(() => {
    this.resetKey();
    untracked(() => this.viewport()?.scrollToIndex(0));
  });

  trackRow(_index: number, row: ScreenerRowView): number {
    return row.series;
  }

  onSort(key: ScreenerSortKey): void {
    this.clickedSort.emit(key);
  }

  onToggleWatchlist(id: string, watched: boolean): void {
    this.toggledWatchlist.emit({ id, watched });
  }

  onScrolledIndex(first: number): void {
    const size = this.viewport()?.getViewportSize() ?? 0;
    const visible = size > 0 ? Math.ceil(size / ROW_HEIGHT_PX) : FALLBACK_VISIBLE_ROWS;
    this.changedRange.emit({ start: first, end: first + visible });
  }

  #button(key: ScreenerSortKey, label: string, long: string | null): ScreenerSortButton {
    const sort = this.sort();
    const active = sort.key === key;
    return {
      key,
      label,
      description: long === null ? null : `(${long})`,
      active,
      direction: active ? sort.direction : null,
      ariaSort: !active ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending',
      icon: !active ? 'arrow-down-up' : sort.direction === 'asc' ? 'sort-up' : 'sort-down',
    };
  }
}
