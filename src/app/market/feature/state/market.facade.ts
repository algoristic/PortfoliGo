import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { ChartRange } from '@app/market/domain/models/chart.model';

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

  instrumentQuote$(id: string): Observable<InstrumentQuote | null> {
    return this.#store.pipe(select(MarketSelectors.selectInstrumentQuote(id)));
  }

  enterMarketsPage(): void {
    this.#store.dispatch(MarketActions.enterMarketsPage());
  }

  leaveMarketsPage(): void {
    this.#store.dispatch(MarketActions.leaveMarketsPage());
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
}
