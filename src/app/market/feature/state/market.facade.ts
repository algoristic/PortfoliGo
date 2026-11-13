import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { ChartRange } from '@app/market/domain/models/chart.model';
import { ScreenerSortKey, YieldRange } from '@app/market/domain/models/screener.model';
import { ScreenerFilterDimension, ScreenerRange } from '@app/market/ui/models/screener-view.model';

import * as MarketActions from './market.actions';
import { InstrumentQuote } from './market.model';
import * as MarketSelectors from './market.selectors';

@Injectable()
export class MarketFacade {
  readonly #store = inject(Store);

  instruments$ = this.#store.pipe(select(MarketSelectors.selectInstruments));
  instrumentsLoaded$ = this.#store.pipe(select(MarketSelectors.selectInstrumentsLoaded));
  instrumentsByKind$ = this.#store.pipe(select(MarketSelectors.selectInstrumentsByKind));
  instrumentsBySeries$ = this.#store.pipe(select(MarketSelectors.selectInstrumentsBySeries));
  quotes$ = this.#store.pipe(select(MarketSelectors.selectQuoteEntities));
  movers$ = this.#store.pipe(select(MarketSelectors.selectMovers));
  routeInstrument$ = this.#store.pipe(select(MarketSelectors.selectRouteInstrument));
  routeInstrumentQuote$ = this.#store.pipe(select(MarketSelectors.selectRouteInstrumentQuote));
  chart$ = this.#store.pipe(select(MarketSelectors.selectChartView));
  instrumentHead$ = this.#store.pipe(select(MarketSelectors.selectInstrumentHead));
  instrumentDetail$ = this.#store.pipe(select(MarketSelectors.selectInstrumentDetailView));
  overviewIndices$ = this.#store.pipe(select(MarketSelectors.selectOverviewIndices));
  moversView$ = this.#store.pipe(select(MarketSelectors.selectMoversView));
  screener$ = this.#store.pipe(select(MarketSelectors.selectScreenerView));
  screenerRows$ = this.#store.pipe(select(MarketSelectors.selectScreenerRows));
  watchlistRows$ = this.#store.pipe(select(MarketSelectors.selectWatchlistRows));
  watchlistKnown$ = this.#store.pipe(select(MarketSelectors.selectWatchlistKnown));
  watchlistMembership$ = this.#store.pipe(select(MarketSelectors.selectWatchlistMembership));
  routeInstrumentWatchlist$ = this.#store.pipe(
    select(MarketSelectors.selectRouteInstrumentWatchlist),
  );

  instrumentQuote$(id: string): Observable<InstrumentQuote | null> {
    return this.#store.pipe(select(MarketSelectors.selectInstrumentQuote(id)));
  }

  enterMarketsPage(): void {
    this.#store.dispatch(MarketActions.enterMarketsPage());
  }

  leaveMarketsPage(): void {
    this.#store.dispatch(MarketActions.leaveMarketsPage());
  }

  enterScreenerPage(): void {
    this.#store.dispatch(MarketActions.enterScreenerPage());
  }

  leaveScreenerPage(): void {
    this.#store.dispatch(MarketActions.leaveScreenerPage());
  }

  enterWatchlistPage(): void {
    this.#store.dispatch(MarketActions.enterWatchlistPage());
  }

  leaveWatchlistPage(): void {
    this.#store.dispatch(MarketActions.leaveWatchlistPage());
  }

  enterInstrumentPage(): void {
    this.#store.dispatch(MarketActions.enterInstrumentPage());
  }

  leaveInstrumentPage(): void {
    this.#store.dispatch(MarketActions.leaveInstrumentPage());
  }

  /** The view `key` now watches the quotes of `series` (e.g. the visible rows of the screener). */
  watchQuotes(key: string, series: readonly number[]): void {
    this.#store.dispatch(MarketActions.quotesSubscriptionChanged({ key, series }));
  }

  stopWatchingQuotes(key: string): void {
    this.#store.dispatch(MarketActions.quotesSubscriptionEnded({ key }));
  }

  watchMovers(key: string): void {
    this.#store.dispatch(MarketActions.moversSubscriptionStarted({ key }));
  }

  stopWatchingMovers(key: string): void {
    this.#store.dispatch(MarketActions.moversSubscriptionEnded({ key }));
  }

  selectChartRange(range: ChartRange): void {
    this.#store.dispatch(MarketActions.clickedChartRange({ range }));
  }

  selectChartType(chartType: PriceChartType): void {
    this.#store.dispatch(MarketActions.clickedChartType({ chartType }));
  }

  /** Shows a past day in 1T; `null` returns to the live day. */
  showChartDay(day: number | null): void {
    this.#store.dispatch(MarketActions.clickedChartDay({ day }));
  }

  /** Shows the day of the date field (already the market day on or before it, `null` = live). */
  submitChartDate(day: number | null): void {
    this.#store.dispatch(MarketActions.submittedChartDate({ day }));
  }

  loadOlderChartCandles(): void {
    this.#store.dispatch(MarketActions.scrolledToChartStart());
  }

  /** Adds an indicator (`id` `null`) or changes the parameters of one. */
  submitChartIndicator(id: string | null, spec: IndicatorSpec): void {
    this.#store.dispatch(MarketActions.submittedChartIndicator({ id, spec }));
  }

  removeChartIndicator(id: string): void {
    this.#store.dispatch(MarketActions.clickedRemoveChartIndicator({ id }));
  }

  searchScreener(search: string): void {
    this.#store.dispatch(MarketActions.enteredScreenerSearch({ search }));
  }

  filterScreener(dimension: ScreenerFilterDimension, values: string[]): void {
    this.#store.dispatch(MarketActions.selectedScreenerFilter({ dimension, values }));
  }

  filterScreenerDividendYield(range: YieldRange): void {
    this.#store.dispatch(MarketActions.submittedScreenerDividendYield({ range }));
  }

  sortScreener(key: ScreenerSortKey): void {
    this.#store.dispatch(MarketActions.clickedScreenerSort({ key }));
  }

  resetScreenerFilter(): void {
    this.#store.dispatch(MarketActions.clickedResetScreenerFilter());
  }

  /** The rows the screener list renders (the visible rows subscribe their quotes). */
  scrollScreener(range: ScreenerRange): void {
    this.#store.dispatch(MarketActions.scrolledScreener({ range }));
  }

  addToWatchlist(id: string): void {
    this.#store.dispatch(MarketActions.clickedAddToWatchlist({ id }));
  }

  removeFromWatchlist(id: string): void {
    this.#store.dispatch(MarketActions.clickedRemoveFromWatchlist({ id }));
  }

  /** A row dragged with the pointer from list position `from` to `to`. */
  dropWatchlistItem(from: number, to: number): void {
    this.#store.dispatch(MarketActions.droppedWatchlistItem({ from, to }));
  }

  /** A row moved with the keyboard alternative. */
  moveWatchlistItem(from: number, to: number): void {
    this.#store.dispatch(MarketActions.movedWatchlistItem({ from, to }));
  }
}
