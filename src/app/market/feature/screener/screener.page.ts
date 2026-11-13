import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ScreenerSortKey, YieldRange } from '@app/market/domain/models/screener.model';
import { ScreenerRange } from '@app/market/ui/models/screener-view.model';
import { ScreenerFilterComponent } from '@app/market/ui/screener-filter/screener-filter.component';
import { ScreenerFilterSelection } from '@app/market/ui/screener-filter/screener-filter.model';
import { ScreenerListComponent } from '@app/market/ui/screener-list/screener-list.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { MarketFacade } from '../state/market.facade';

/**
 * Screener (US-MK-02): search, combinable filters and sorting over all series; the list scrolls
 * virtually and shows live prices for the visible rows (US-MK-05).
 */
@Component({
  selector: 'app-screener-page',
  imports: [CommonModule, PanelComponent, ScreenerFilterComponent, ScreenerListComponent],
  templateUrl: './screener.page.html',
  host: { class: 'block' },
})
export class ScreenerPage {
  facade = inject(MarketFacade);

  onSearch(search: string): void {
    this.facade.searchScreener(search);
  }

  onFilter({ dimension, values }: ScreenerFilterSelection): void {
    this.facade.filterScreener(dimension, values);
  }

  onDividendYield(range: YieldRange): void {
    this.facade.filterScreenerDividendYield(range);
  }

  onReset(): void {
    this.facade.resetScreenerFilter();
  }

  onSort(key: ScreenerSortKey): void {
    this.facade.sortScreener(key);
  }

  onRange(range: ScreenerRange): void {
    this.facade.scrollScreener(range);
  }
}
