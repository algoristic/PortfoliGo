import { Candle } from '@app/market/domain/models/candle.model';
import { Instrument } from '@app/market/domain/models/instrument.model';

import { initialChartState } from './market.reducer';
import {
  selectChartView,
  selectInstrumentQuote,
  selectInstrumentsByKind,
  selectInstrumentsBySeries,
  selectOverviewIndexSeries,
  selectRouteInstrument,
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
});
