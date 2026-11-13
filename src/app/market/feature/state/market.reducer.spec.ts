import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { Candle } from '@app/market/domain/models/candle.model';
import { ScreenerRow } from '@app/market/domain/models/screener.model';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as MarketActions from './market.actions';
import { InstrumentChartState } from './market.model';
import {
  initialChartState,
  initialMarketState,
  marketReducer,
  MarketState,
} from './market.reducer';

function quote(series: number, last = 100): SeriesQuote {
  return { series, last, bid: null, ask: null, previousClose: 100, change: 0, changeRatio: 0 };
}

function reduce(...actions: Parameters<typeof marketReducer>[1][]): MarketState {
  return actions.reduce(marketReducer, initialMarketState);
}

describe('marketReducer', () => {
  describe('quotesSubscriptionChanged', () => {
    it('stores the series sorted and without duplicates', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [3, 1, 3] }),
      );
      expect(state.quoteSubscriptions).toEqual({ a: [1, 3] });
    });

    it('keeps the state when the set of a key is the same', () => {
      const before = reduce(MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1, 2] }));
      const after = marketReducer(
        before,
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [2, 1] }),
      );
      expect(after).toBe(before);
    });

    it('drops the quotes of series that no key watches any more', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1, 2] }),
        MarketActions.quotesSubscriptionChanged({ key: 'b', series: [2] }),
        MarketActions.receivedQuotes({ quotes: [quote(1), quote(2)] }),
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [3] }),
      );
      expect(state.quotes.ids).toEqual([2]);
    });
  });

  describe('quotesSubscriptionEnded', () => {
    it('removes the key and the quotes only it watched', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1, 2] }),
        MarketActions.quotesSubscriptionChanged({ key: 'b', series: [2] }),
        MarketActions.receivedQuotes({ quotes: [quote(1), quote(2)] }),
        MarketActions.quotesSubscriptionEnded({ key: 'a' }),
      );
      expect(state.quoteSubscriptions).toEqual({ b: [2] });
      expect(state.quotes.ids).toEqual([2]);
    });
  });

  describe('receivedQuotes', () => {
    it('takes only quotes of watched series and replaces older ones', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1] }),
        MarketActions.receivedQuotes({ quotes: [quote(1, 100)] }),
        MarketActions.receivedQuotes({ quotes: [quote(1, 105), quote(9, 50)] }),
      );
      expect(state.quotes.ids).toEqual([1]);
      expect(state.quotes.entities[1]?.last).toBe(105);
    });
  });

  describe('movers', () => {
    const movers = { tick: 5, gainers: [quote(1)], losers: [], sectors: [] };

    it('ignores movers while no view watches them', () => {
      expect(reduce(MarketActions.receivedMovers({ movers })).movers).toBeNull();
    });

    it('keeps the movers until the last view ends its subscription', () => {
      const watched = reduce(
        MarketActions.moversSubscriptionStarted({ key: 'a' }),
        MarketActions.moversSubscriptionStarted({ key: 'b' }),
        MarketActions.moversSubscriptionStarted({ key: 'b' }),
        MarketActions.receivedMovers({ movers }),
        MarketActions.moversSubscriptionEnded({ key: 'a' }),
      );
      expect(watched.movers).toEqual(movers);
      const ended = marketReducer(watched, MarketActions.moversSubscriptionEnded({ key: 'b' }));
      expect(ended.moversSubscriptions).toEqual([]);
      expect(ended.movers).toBeNull();
    });
  });

  it('drops everything when the game is left', () => {
    const state = reduce(
      MarketActions.retrievedInstruments({ instruments: [] }),
      MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1] }),
      SessionActions.leaveGame(),
    );
    expect(state).toEqual(initialMarketState);
    expect(
      marketReducer(state, SessionActions.enterGame({ profile: { id: 'p' } as PlayerProfile })),
    ).toEqual(initialMarketState);
  });

  describe('chart', () => {
    const candle = (tick: number, close = 10): Candle => ({
      tick,
      open: 10,
      high: 11,
      low: 9,
      close,
    });
    const loaded = [candle(600), candle(601)];

    function withChart(chart: Partial<InstrumentChartState>): MarketState {
      return { ...initialMarketState, chart: { ...initialChartState, ...chart } };
    }

    it('starts the live chart of a new instrument with period and chart type kept', () => {
      const state = marketReducer(
        withChart({ range: '1y', chartType: 'line', day: 5, generation: 4, candles: loaded }),
        MarketActions.enterInstrumentPage(),
      );
      expect(state.chart).toEqual({
        ...initialChartState,
        range: '1y',
        chartType: 'line',
        generation: 5,
        loading: true,
      });
    });

    it('drops the candles when the page is left', () => {
      const state = marketReducer(
        withChart({ generation: 2, candles: loaded, loadingOlder: true }),
        MarketActions.leaveInstrumentPage(),
      );
      expect(state.chart).toEqual({ ...initialChartState, generation: 3 });
    });

    it('loads a new block for another period, a past day or the live day again', () => {
      const live = withChart({ range: '1d', generation: 1, candles: loaded });
      expect(marketReducer(live, MarketActions.clickedChartRange({ range: '1d' }))).toBe(live);
      expect(marketReducer(live, MarketActions.clickedChartDay({ day: null }))).toBe(live);

      const month = marketReducer(live, MarketActions.clickedChartRange({ range: '1m' })).chart;
      expect(month).toMatchObject({ range: '1m', generation: 2, loading: true, candles: [] });

      // A day switches to 1T; 1T on a past day returns to live.
      const day = marketReducer(
        withChart({ range: '1m', generation: 2 }),
        MarketActions.submittedChartDate({ day: 2000 }),
      ).chart;
      expect(day).toMatchObject({ range: '1d', day: 2000, generation: 3, loading: true });
      const back = marketReducer(
        withChart(day),
        MarketActions.clickedChartRange({ range: '1d' }),
      ).chart;
      expect(back).toMatchObject({ day: null, generation: 4 });
    });

    it('keeps the chart type without loading', () => {
      const state = marketReducer(
        withChart({ generation: 1, candles: loaded }),
        MarketActions.clickedChartType({ chartType: 'area' }),
      );
      expect(state.chart).toMatchObject({ chartType: 'area', generation: 1, candles: loaded });
    });

    it('takes only the answer of the current generation', () => {
      const waiting = withChart({ generation: 3, loading: true });
      const stale = MarketActions.retrievedChartCandles({
        generation: 2,
        candles: loaded,
        hasOlder: true,
      });
      expect(marketReducer(waiting, stale)).toBe(waiting);
      const state = marketReducer(
        waiting,
        MarketActions.retrievedChartCandles({ generation: 3, candles: loaded, hasOlder: true }),
      );
      expect(state.chart).toMatchObject({ candles: loaded, hasOlder: true, loading: false });
      const failed = marketReducer(
        waiting,
        MarketActions.loadChartCandlesFailure({ generation: 3, error: 'x' }),
      );
      expect(failed.chart).toMatchObject({ loading: false, error: 'x' });
    });

    describe('older candles', () => {
      const ready = withChart({ generation: 1, candles: loaded, hasOlder: true });

      it('asks once while idle and only when older candles exist', () => {
        const asking = marketReducer(ready, MarketActions.scrolledToChartStart());
        expect(asking.chart.loadingOlder).toBe(true);
        expect(marketReducer(asking, MarketActions.scrolledToChartStart())).toBe(asking);
        const complete = withChart({ generation: 1, candles: loaded, hasOlder: false });
        expect(marketReducer(complete, MarketActions.scrolledToChartStart())).toBe(complete);
        const loading = withChart({ ...ready.chart, reloading: true });
        expect(marketReducer(loading, MarketActions.scrolledToChartStart())).toBe(loading);
      });

      it('prepends the block and keeps the candles for an empty one', () => {
        const asking = marketReducer(ready, MarketActions.scrolledToChartStart());
        const older = [candle(500), candle(600, 99)];
        const state = marketReducer(
          asking,
          MarketActions.retrievedOlderChartCandles({
            generation: 1,
            candles: older,
            hasOlder: false,
          }),
        );
        expect(state.chart).toMatchObject({
          candles: [candle(500), ...loaded],
          hasOlder: false,
          loadingOlder: false,
        });
        const empty = marketReducer(
          asking,
          MarketActions.retrievedOlderChartCandles({ generation: 1, candles: [], hasOlder: true }),
        );
        expect(empty.chart.candles).toBe(loaded);
        const stale = marketReducer(
          asking,
          MarketActions.retrievedOlderChartCandles({
            generation: 0,
            candles: older,
            hasOlder: false,
          }),
        );
        expect(stale).toBe(asking);
      });
    });

    describe('live candles', () => {
      const live = withChart({ generation: 2, candles: loaded });

      it('replaces the running candle and appends the next one', () => {
        const running = candle(601, 12);
        const replaced = marketReducer(
          live,
          MarketActions.receivedLiveCandle({ generation: 2, live: { candle: running } }),
        );
        expect(replaced.chart.candles).toEqual([loaded[0], running]);
        const next = candle(602);
        const appended = marketReducer(
          replaced,
          MarketActions.receivedLiveCandle({
            generation: 2,
            live: { candle: next, previous: candle(601, 13) },
          }),
        );
        expect(appended.chart.candles).toEqual([loaded[0], candle(601, 13), next]);
      });

      it('ignores live candles of an old generation or while a block loads', () => {
        const action = MarketActions.receivedLiveCandle({
          generation: 2,
          live: { candle: candle(601, 12) },
        });
        expect(
          marketReducer(withChart({ ...live.chart, reloading: true }), action).chart.candles,
        ).toBe(loaded);
        const old = withChart({ ...live.chart, generation: 3 });
        expect(marketReducer(old, action)).toBe(old);
      });

      it('loads the block again after a gap and keeps the candles meanwhile', () => {
        const state = marketReducer(live, MarketActions.detectedChartGap({ generation: 2 }));
        expect(state.chart).toMatchObject({
          generation: 3,
          reloading: true,
          loading: false,
          candles: loaded,
        });
        expect(marketReducer(state, MarketActions.detectedChartGap({ generation: 2 }))).toBe(state);
      });
    });
  });

  describe('chart settings and indicators', () => {
    const settings = {
      range: '1y' as const,
      chartType: 'area' as const,
      indicators: [
        { id: 'i4', spec: { kind: 'sma' as const, period: 50 }, color: 'chart-3' as const },
      ],
    };

    it('takes over the stored settings and keeps them for every instrument', () => {
      const state = reduce(
        MarketActions.loadedChartSettings({ settings }),
        MarketActions.enterInstrumentPage(),
        MarketActions.leaveInstrumentPage(),
        MarketActions.clickedChartDay({ day: 3000 }),
      );
      expect(state.chart.chartType).toBe('area');
      expect(state.chart.indicators).toBe(settings.indicators);
      expect(state.chart.range).toBe('1d');
      expect(reduce(MarketActions.loadedChartSettings({ settings })).chart.range).toBe('1y');
    });

    it('adds, changes and removes indicators', () => {
      const added = reduce(
        MarketActions.loadedChartSettings({ settings }),
        MarketActions.submittedChartIndicator({
          id: null,
          spec: { kind: 'bollinger', period: 20, multiplier: 2 },
        }),
      );
      expect(added.chart.indicators.map(({ id, color }) => [id, color])).toEqual([
        ['i4', 'chart-3'],
        ['i5', 'chart-1'],
      ]);
      const changed = marketReducer(
        added,
        MarketActions.submittedChartIndicator({ id: 'i4', spec: { kind: 'ema', period: 9 } }),
      );
      expect(changed.chart.indicators[0]).toEqual({
        id: 'i4',
        spec: { kind: 'ema', period: 9 },
        color: 'chart-3',
      });
      const removed = marketReducer(
        changed,
        MarketActions.clickedRemoveChartIndicator({ id: 'i4' }),
      );
      expect(removed.chart.indicators.map(({ id }) => id)).toEqual(['i5']);
    });
  });

  describe('screener', () => {
    const entered = reduce(MarketActions.enterScreenerPage());

    function row(series: number): ScreenerRow {
      return {
        id: `s${series}`,
        series,
        last: 10,
        changeRatio: 0,
        performance: { m1: null, m6: null, y1: null, y5: null },
        dividendYield: null,
        sparkline: [],
      };
    }

    it('starts a new generation for every change of search, filter or sort', () => {
      const searched = marketReducer(
        entered,
        MarketActions.enteredScreenerSearch({ search: 'ab' }),
      );
      expect(searched.screener.generation).toBe(entered.screener.generation + 1);
      expect(searched.screener.loading).toBe(true);
      expect(searched.screener.filter.search).toBe('ab');

      const filtered = marketReducer(
        searched,
        MarketActions.selectedScreenerFilter({ dimension: 'sizes', values: ['large'] }),
      );
      expect(filtered.screener.generation).toBe(searched.screener.generation + 1);
      // The same values and the same search keep the state.
      expect(
        marketReducer(
          filtered,
          MarketActions.selectedScreenerFilter({ dimension: 'sizes', values: ['large'] }),
        ),
      ).toBe(filtered);
      expect(marketReducer(filtered, MarketActions.enteredScreenerSearch({ search: 'ab' }))).toBe(
        filtered,
      );
    });

    it('turns the direction on the same column and starts figures descending', () => {
      const byChange = marketReducer(
        entered,
        MarketActions.clickedScreenerSort({ key: 'changeRatio' }),
      );
      expect(byChange.screener.filter.sort).toEqual({ key: 'changeRatio', direction: 'desc' });
      const turned = marketReducer(
        byChange,
        MarketActions.clickedScreenerSort({ key: 'changeRatio' }),
      );
      expect(turned.screener.filter.sort).toEqual({ key: 'changeRatio', direction: 'asc' });
      const byName = marketReducer(turned, MarketActions.clickedScreenerSort({ key: 'name' }));
      expect(byName.screener.filter.sort).toEqual({ key: 'name', direction: 'asc' });
    });

    it('drops countries outside the chosen regions and industries outside the chosen sectors', () => {
      const state = reduce(
        MarketActions.selectedScreenerFilter({ dimension: 'countries', values: ['DE', 'US'] }),
        MarketActions.selectedScreenerFilter({
          dimension: 'industries',
          values: ['software', 'banks'],
        }),
        MarketActions.selectedScreenerFilter({ dimension: 'regions', values: ['europe'] }),
        MarketActions.selectedScreenerFilter({ dimension: 'sectors', values: ['financials'] }),
      );
      expect(state.screener.filter.countries).toEqual(['DE']);
      expect(state.screener.filter.industries).toEqual(['banks']);
    });

    it('resets the filter but keeps the sort', () => {
      const state = reduce(
        MarketActions.enteredScreenerSearch({ search: 'x' }),
        MarketActions.submittedScreenerDividendYield({ range: { min: 0.02 } }),
        MarketActions.clickedScreenerSort({ key: 'y1' }),
        MarketActions.clickedResetScreenerFilter(),
      );
      expect(state.screener.filter).toEqual({
        ...initialMarketState.screener.filter,
        sort: { key: 'y1', direction: 'desc' },
      });
    });

    it('takes only the answer of the current generation', () => {
      const searched = marketReducer(entered, MarketActions.enteredScreenerSearch({ search: 'a' }));
      const result = { total: 1, rows: [row(3)], tick: 0 };
      const stale = marketReducer(
        searched,
        MarketActions.retrievedScreener({ generation: entered.screener.generation, result }),
      );
      expect(stale).toBe(searched);
      const current = marketReducer(
        searched,
        MarketActions.retrievedScreener({ generation: searched.screener.generation, result }),
      );
      expect(current.screener).toMatchObject({ rows: [row(3)], total: 1, loading: false });
    });

    it('keeps the filter for the next visit but drops the rows', () => {
      const state = reduce(
        MarketActions.enterScreenerPage(),
        MarketActions.enteredScreenerSearch({ search: 'a' }),
        MarketActions.retrievedScreener({
          generation: 2,
          result: { total: 1, rows: [row(3)], tick: 0 },
        }),
        MarketActions.leaveScreenerPage(),
      );
      expect(state.screener.filter.search).toBe('a');
      expect(state.screener.rows).toEqual([]);
      expect(state.screener.total).toBeNull();
    });
  });

  describe('overview sparklines', () => {
    const MINUTE = 1;
    const FRIDAY = 5_000_000;
    const MONDAY = FRIDAY + 3 * 1_440;

    function candle(at: number, close = 10): Candle {
      return { tick: at, open: 10, high: 11, low: 9, close };
    }

    it('keeps the candles of the newest day of a loaded block', () => {
      const state = reduce(
        MarketActions.enterMarketsPage(),
        MarketActions.retrievedOverviewSparkline({
          series: 7,
          candles: [candle(FRIDAY), candle(MONDAY), candle(MONDAY + 15 * MINUTE)],
        }),
      );
      expect(state.overviewSparklines[7]).toEqual({
        candles: [candle(MONDAY), candle(MONDAY + 15 * MINUTE)],
        loading: false,
      });
    });

    it('applies live candles and waits for the block after a gap', () => {
      const loaded = reduce(
        MarketActions.enterMarketsPage(),
        MarketActions.retrievedOverviewSparkline({ series: 7, candles: [candle(MONDAY)] }),
      );
      const replaced = marketReducer(
        loaded,
        MarketActions.receivedOverviewSparklineCandle({
          series: 7,
          live: { candle: candle(MONDAY, 12) },
        }),
      );
      expect(replaced.overviewSparklines[7].candles).toEqual([candle(MONDAY, 12)]);

      const gap = marketReducer(
        replaced,
        MarketActions.detectedOverviewSparklineGap({ series: 7 }),
      );
      expect(gap.overviewSparklines[7].loading).toBe(true);
      const ignored = marketReducer(
        gap,
        MarketActions.receivedOverviewSparklineCandle({
          series: 7,
          live: { candle: candle(MONDAY, 13) },
        }),
      );
      expect(ignored).toBe(gap);
    });

    it('drops the sparklines when the page is left', () => {
      const state = reduce(
        MarketActions.enterMarketsPage(),
        MarketActions.retrievedOverviewSparkline({ series: 7, candles: [candle(MONDAY)] }),
        MarketActions.leaveMarketsPage(),
      );
      expect(state.overviewSparklines).toEqual({});
    });
  });
});
