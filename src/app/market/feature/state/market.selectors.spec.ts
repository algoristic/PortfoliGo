import { Candle } from '@app/market/domain/models/candle.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { ScreenerRow } from '@app/market/domain/models/screener.model';

import { initialChartState, initialWatchlistState } from './market.reducer';
import {
  selectChartView,
  selectInstrumentQuote,
  selectInstrumentsByKind,
  selectInstrumentsBySeries,
  selectMoversView,
  selectOverviewIndexSeries,
  selectRouteInstrument,
  selectScreenerRows,
  selectScreenerWindowSeries,
  selectWatchlistIds,
  selectWatchlistMembership,
  selectWatchlistRows,
} from './market.selectors';

const STOCK = { id: 'cmp-0001', series: 0, kind: 'stock' } as Instrument;
const WORLD = {
  id: 'idx-world',
  series: 1,
  kind: 'index',
  variant: 'price',
  indexKind: 'world',
} as Instrument;
const SECTOR = {
  id: 'idx-tech',
  series: 2,
  kind: 'index',
  variant: 'price',
  indexKind: 'sector',
} as Instrument;
const WORLD_TR = {
  id: 'idx-world-tr',
  series: 3,
  kind: 'index',
  variant: 'total-return',
  indexKind: 'world',
} as Instrument;
const ETF = { id: 'etf-0001', series: 4, kind: 'etf' } as Instrument;
const ALL = [STOCK, WORLD, SECTOR, WORLD_TR, ETF];

describe('market selectors', () => {
  describe('selectOverviewIndexSeries', () => {
    it('takes the price indices without the sector indices', () => {
      expect(selectOverviewIndexSeries.projector(ALL)).toEqual([1]);
    });
  });

  describe('selectInstrumentsByKind', () => {
    it('groups the instruments by kind in series order', () => {
      expect(selectInstrumentsByKind.projector(ALL)).toEqual({
        stock: [STOCK],
        index: [WORLD, SECTOR, WORLD_TR],
        etf: [ETF],
      });
    });
  });

  describe('selectInstrumentsBySeries', () => {
    it('finds an instrument by its series', () => {
      expect(selectInstrumentsBySeries.projector(ALL).get(4)).toBe(ETF);
    });
  });

  describe('selectInstrumentQuote', () => {
    const quote = {
      series: 0,
      last: 10,
      bid: 9.99,
      ask: 10.01,
      previousClose: 10,
      change: 0,
      changeRatio: 0,
    };

    it('joins the instrument with the quote of its series', () => {
      expect(selectInstrumentQuote(STOCK.id).projector(STOCK, { 0: quote })).toEqual({
        instrument: STOCK,
        quote,
      });
    });

    it('has no quote before the first one arrived and nothing for an unknown instrument', () => {
      expect(selectInstrumentQuote(STOCK.id).projector(STOCK, {})).toEqual({
        instrument: STOCK,
        quote: null,
      });
      expect(selectInstrumentQuote('x').projector(null, { 0: quote })).toBeNull();
    });
  });

  describe('selectRouteInstrument', () => {
    it('is null without a parameter or for an unknown ID', () => {
      const entities = { [STOCK.id]: STOCK };
      expect(selectRouteInstrument.projector(STOCK.id, entities)).toBe(STOCK);
      expect(selectRouteInstrument.projector(undefined, entities)).toBeNull();
      expect(selectRouteInstrument.projector('cmp-9999', entities)).toBeNull();
    });
  });
});

describe('selectChartView', () => {
  // Day indices from `Date.UTC` (01.01.2020 is day 0).
  const day = (year: number, month: number, date: number): number =>
    (Date.UTC(year, month - 1, date) - Date.UTC(2020, 0, 1)) / 86_400_000;
  const candle = (tick: number): Candle => ({ tick, open: 1, high: 1, low: 1, close: 1 });
  const today = day(2030, 4, 3); // Wed

  it('shows the day of the newest candle live and offers the day before', () => {
    const last = candle(day(2030, 4, 2) * 1440 + 600);
    const view = selectChartView.projector({ ...initialChartState, candles: [last] }, today);
    expect(view).toMatchObject({
      live: true,
      interval: '1m',
      lastCandle: last,
      shownDay: day(2030, 4, 2),
      shownDayTick: day(2030, 4, 2) * 1440,
      previousDay: day(2030, 4, 1),
      nextDay: undefined,
      today,
      failed: false,
    });
  });

  it('offers the next day of a chosen day and live after the last past day', () => {
    const friday = selectChartView.projector(
      { ...initialChartState, day: day(2030, 3, 29) },
      today,
    );
    expect(friday.nextDay).toBe(day(2030, 4, 1));
    const tuesday = selectChartView.projector(
      { ...initialChartState, day: day(2030, 4, 2) },
      today,
    );
    expect(tuesday.nextDay).toBeNull();
  });

  it('reports a failure only without candles', () => {
    expect(selectChartView.projector({ ...initialChartState, error: 'x' }, today).failed).toBe(
      true,
    );
    expect(
      selectChartView.projector({ ...initialChartState, error: 'x', candles: [candle(1)] }, today)
        .failed,
    ).toBe(false);
  });

  describe('selectScreenerRows', () => {
    const row: ScreenerRow = {
      id: STOCK.id,
      series: 0,
      last: 10,
      changeRatio: 0.01,
      performance: { m1: 0.02, m6: 0.06, y1: 0.12, y5: 0.6 },
      dividendYield: 0.03,
      sparkline: [9, 10],
    };
    const unknown: ScreenerRow = { ...row, id: 'x', series: 99 };
    const instruments = new Map([[0, { ...STOCK, name: 'Velora AG', ticker: 'VEL' }]]);

    it('shows the live quote where one arrived and the performance of the sorted period', () => {
      const views = selectScreenerRows.projector(
        [row, unknown],
        {
          0: {
            series: 0,
            last: 11,
            bid: 10.99,
            ask: 11.01,
            previousClose: 10.78,
            change: 0.22,
            changeRatio: 0.02,
          },
        },
        instruments,
        'm6',
      );
      expect(views).toEqual([
        {
          id: STOCK.id,
          series: 0,
          name: 'Velora AG',
          ticker: 'VEL',
          kind: 'stock',
          last: 11,
          changeRatio: 0.02,
          sparkline: [9, 10],
          performance: 0.06,
          dividendYield: 0.03,
        },
      ]);
    });

    it('keeps the figures of the query without a quote', () => {
      const [view] = selectScreenerRows.projector([row], {}, instruments, 'y1');
      expect(view).toMatchObject({ last: 10, changeRatio: 0.01, performance: 0.12 });
    });
  });

  describe('selectScreenerWindowSeries', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ series: 100 + index }) as ScreenerRow);

    it('watches the rendered rows and ten before and after them', () => {
      expect(selectScreenerWindowSeries.projector(rows, { start: 20, end: 25 })).toEqual(
        Array.from({ length: 25 }, (_, index) => 110 + index),
      );
      expect(selectScreenerWindowSeries.projector(rows, { start: 0, end: 5 })).toEqual(
        Array.from({ length: 15 }, (_, index) => 100 + index),
      );
      expect(selectScreenerWindowSeries.projector(rows, { start: 45, end: 60 })).toEqual(
        Array.from({ length: 15 }, (_, index) => 135 + index),
      );
    });
  });

  describe('selectMoversView', () => {
    it('adds the instruments, the heat level and the sector index of every tile', () => {
      const quote = (series: number, changeRatio: number) => ({
        series,
        last: 10,
        bid: null,
        ask: null,
        previousClose: 10,
        change: 0,
        changeRatio,
      });
      const view = selectMoversView.projector(
        {
          tick: 0,
          gainers: [quote(0, 0.03), quote(42, 0.02)],
          losers: [],
          sectors: [{ sectorId: 'technology', quote: quote(2, -0.012) }],
        },
        new Map([
          [0, STOCK],
          [2, SECTOR],
        ]),
      );
      expect(view?.gainers.map(({ instrument }) => instrument.id)).toEqual([STOCK.id]);
      // TS §11.3: a loss of 1.2 % is level −3 (from 1 %).
      expect(view?.sectors).toEqual([
        { sectorId: 'technology', instrumentId: SECTOR.id, changeRatio: -0.012, level: -3 },
      ]);
      expect(selectMoversView.projector(null, new Map())).toBeNull();
    });
  });
});

describe('watchlist selectors', () => {
  describe('selectWatchlistIds', () => {
    it('shows the requested list before the confirmed one and nothing before the projection', () => {
      expect(selectWatchlistIds.projector(initialWatchlistState)).toEqual([]);
      expect(selectWatchlistIds.projector({ ...initialWatchlistState, ids: ['a'] })).toEqual(['a']);
      expect(
        selectWatchlistIds.projector({ ...initialWatchlistState, ids: ['a'], requested: ['b'] }),
      ).toEqual(['b']);
    });
  });

  describe('selectWatchlistMembership', () => {
    it('is full at 50 instruments (TS §8.2)', () => {
      const ids = (count: number): string[] => Array.from({ length: count }, (_v, n) => `c${n}`);
      expect(selectWatchlistMembership.projector(ids(49), true).full).toBe(false);
      expect(selectWatchlistMembership.projector(ids(50), true).full).toBe(true);
    });
  });

  describe('selectWatchlistRows', () => {
    const row: ScreenerRow = {
      id: ETF.id,
      series: ETF.series,
      last: 50,
      changeRatio: 0.02,
      performance: { m1: null, m6: null, y1: null, y5: null },
      dividendYield: 0,
      sparkline: [48, 49, 50],
    };
    const quote = {
      series: STOCK.series,
      last: 12,
      bid: null,
      ask: null,
      previousClose: 10,
      change: 2,
      changeRatio: 0.2,
    };

    it('keeps the list order, prefers live quotes and skips unknown instruments', () => {
      const rows = selectWatchlistRows.projector(
        [ETF.id, 'gone', STOCK.id],
        { [ETF.id]: { ...ETF, name: 'Welt ETF', ticker: 'WETF' } as Instrument, [STOCK.id]: STOCK },
        { [STOCK.series]: quote },
        { ...initialWatchlistState, rows: [row] },
      );
      expect(rows.map(({ id }) => id)).toEqual([ETF.id, STOCK.id]);
      expect(rows[0]).toMatchObject({ last: 50, changeRatio: 0.02, sparkline: [48, 49, 50] });
      expect(rows[1]).toMatchObject({ last: 12, changeRatio: 0.2, sparkline: [] });
    });

    it('has no price before a quote or the screener figures arrived', () => {
      const [only] = selectWatchlistRows.projector(
        [STOCK.id],
        { [STOCK.id]: STOCK },
        {},
        initialWatchlistState,
      );
      expect(only).toMatchObject({ last: null, changeRatio: null });
    });
  });
});
