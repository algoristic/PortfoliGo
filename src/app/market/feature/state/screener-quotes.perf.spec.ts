// NgRx declares injectables that need the JIT compiler outside an Angular build (plain Vitest).
import '@angular/compiler';
import '@angular/localize/init';

import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { ScreenerRow } from '@app/market/domain/models/screener.model';

import * as MarketActions from './market.actions';
import { initialMarketState, marketReducer, MarketState } from './market.reducer';
import {
  selectMoversView,
  selectOverviewIndices,
  selectScreenerRows,
  selectScreenerWindowSeries,
} from './market.selectors';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../../testing/perf';

// Budget of TS §14.3 for the main thread (AP 4.4): live prices stay smooth when a quote package for
// 250 instruments costs less than 4 ms on the main thread. Measured: the reducer takes the bundled
// package (`receivedQuotes`), the selectors build the screener rows of all matches (274 series of
// the standard world, every row with its live quote), the subscription window and the overview
// views. Without Angular's rendering of the rendered rows (about 15 with virtual scrolling).

const SERIES = 274;
const QUOTED = 250;

function instrument(series: number): Instrument {
  return {
    id: `stk-${series}`,
    series,
    kind: 'stock',
    name: `Velora ${series} AG`,
    ticker: `V${series}`,
    isin: `QP${String(series).padStart(10, '0')}`,
    exchangeId: 'exc-de',
    regionId: 'europe',
    countryId: 'DE',
    sectorId: 'technology',
    industryId: 'software',
    size: 'large',
    style: 'growth',
    riskClass: 3,
    savingsPlanEligible: true,
  };
}

function row(series: number): ScreenerRow {
  return {
    id: `stk-${series}`,
    series,
    last: 100,
    changeRatio: 0.01,
    performance: { m1: 0.01, m6: 0.05, y1: 0.1, y5: 0.5 },
    dividendYield: 0.02,
    sparkline: Array.from({ length: 22 }, (_, day) => 90 + day),
  };
}

function quote(series: number, step: number): SeriesQuote {
  const last = 100 + ((series + step) % 7) / 10;
  return {
    series,
    last,
    bid: last - 0.01,
    ask: last + 0.01,
    previousClose: 100,
    change: last - 100,
    changeRatio: (last - 100) / 100,
  };
}

describe('screener quotes on the main thread', () => {
  it('takes a quote package for 250 instruments within the budget', () => {
    const quoted = Array.from({ length: QUOTED }, (_, series) => series);
    let state: MarketState = [
      MarketActions.retrievedInstruments({
        instruments: Array.from({ length: SERIES }, (_, series) => instrument(series)),
      }),
      MarketActions.enterScreenerPage(),
      MarketActions.retrievedScreener({
        generation: 1,
        result: {
          total: SERIES,
          rows: Array.from({ length: SERIES }, (_, series) => row(series)),
          tick: 0,
        },
      }),
      MarketActions.quotesSubscriptionChanged({ key: 'perf', series: quoted }),
    ].reduce(marketReducer, initialMarketState);

    let step = 0;
    let rows = 0;
    const ms = medianMs(
      () => {
        step++;
        const quotes = quoted.map((series) => quote(series, step));
        state = marketReducer(state, MarketActions.receivedQuotes({ quotes }));
        const root = { market: state };
        rows = selectScreenerRows(root).length;
        selectScreenerWindowSeries(root);
        selectOverviewIndices(root);
        selectMoversView(root);
      },
      9,
      3,
    );
    expect(rows).toBe(SERIES);
    expect(state.quotes.ids).toHaveLength(QUOTED);
    expectWithinBudget(
      'Quote package for 250 instruments on the main thread',
      ms,
      BUDGETS_MS.quotesUi,
    );
  });
});
