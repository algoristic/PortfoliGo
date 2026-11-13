import { ExchangeInfo } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { InstrumentFigures } from '@app/market/domain/models/instrument-figures.model';
import { Instrument } from '@app/market/domain/models/instrument.model';

import {
  compositionSegments,
  instrumentDetailView,
  instrumentHeadView,
  isUnknownInstrument,
} from './instrument-view.utils';
import { InstrumentDetailState } from './market.model';
import { initialInstrumentDetailState } from './market.reducer';

const MINUTE_MS = 60_000;

/** Tick of a game time (UTC): game minutes since 01.01.2020 (TS §4.2). */
function tickAt(year: number, month: number, day: number, minute = 0): number {
  return (Date.UTC(year, month - 1, day) - Date.UTC(2020, 0, 1)) / MINUTE_MS + minute;
}

const EXCHANGES: ExchangeInfo[] = [
  { id: 'exc-de', name: 'Börse Mainhafen', regionId: 'europe', open: 540, close: 1050 },
  { id: 'exc-gb', name: 'Thames Exchange', regionId: 'europe', open: 480, close: 990 },
  { id: 'exc-us', name: 'Liberty Exchange', regionId: 'north-america', open: 930, close: 1320 },
];

const STOCK = {
  id: 'stk-0001',
  series: 0,
  kind: 'stock',
  name: 'Velora AG',
  ticker: 'VEL',
  isin: 'QP0000000001',
  exchangeId: 'exc-de',
  regionId: 'europe',
} as Instrument;
const EUROPE_INDEX = {
  id: 'idx-0002',
  series: 5,
  kind: 'index',
  variant: 'price',
  regionId: 'europe',
  exchangeId: null,
  isin: null,
} as Instrument;
const WORLD_INDEX = { ...EUROPE_INDEX, id: 'idx-0001', regionId: null } as Instrument;
const ACCUMULATING = {
  id: 'etf-0001',
  series: 9,
  kind: 'etf',
  distribution: 'accumulating',
  distributionFrequency: null,
  exchangeId: 'exc-de',
  fundVolume: 52_960_000_000,
} as Instrument;

function quote(bid: number | null, ask: number | null, last: number): SeriesQuote {
  return { series: 0, last, bid, ask, previousClose: 10, change: last - 10, changeRatio: 0 };
}

function detail(changes: Partial<InstrumentDetailState> = {}): InstrumentDetailState {
  return { ...initialInstrumentDetailState, generation: 1, ...changes };
}

describe('instrumentHeadView', () => {
  // Mon 01.04.2030, 10:00: Börse Mainhafen (09:00–17:30) is open, Liberty Exchange opens at 15:30.
  const TEN = tickAt(2030, 4, 1, 600);

  it('gives the spread absolute and relative to the middle with the decimals of the price', () => {
    // Bid 8,995, ask 9,005: spread 0,010, middle 9,000 → 0,111 %; prices from 1 to 10 € have three.
    const head = instrumentHeadView(STOCK, quote(8.995, 9.005, 9), EXCHANGES, TEN, detail());
    expect(head.spread).toBeCloseTo(0.01, 12);
    expect(head.spreadRatio).toBeCloseTo(0.01 / 9, 12);
    expect(head.priceDecimals).toBe(3);
    expect(head.exchangeName).toBe('Börse Mainhafen');
    expect(head.status).toEqual({ open: true, changesAt: tickAt(2030, 4, 1, 1050) });
  });

  it('has no spread without bid and ask (indices) and before the first quote', () => {
    expect(
      instrumentHeadView(EUROPE_INDEX, quote(null, null, 900), EXCHANGES, TEN, detail()),
    ).toMatchObject({ bid: null, ask: null, spread: null, spreadRatio: null, exchangeName: null });
    expect(instrumentHeadView(STOCK, null, EXCHANGES, TEN, detail())).toMatchObject({
      last: null,
      spread: null,
      priceDecimals: 2,
    });
  });

  it('takes the exchanges of the region for an index and all exchanges for a global one', () => {
    // 07:00: Thames Exchange opens first at 08:00; at 16:00 Europe stays open until 17:30, the world
    // until Liberty Exchange closes at 22:00.
    const seven = tickAt(2030, 4, 1, 420);
    const four = tickAt(2030, 4, 1, 960);
    expect(instrumentHeadView(EUROPE_INDEX, null, EXCHANGES, seven, detail()).status).toEqual({
      open: false,
      changesAt: tickAt(2030, 4, 1, 480),
    });
    expect(instrumentHeadView(EUROPE_INDEX, null, EXCHANGES, four, detail()).status).toEqual({
      open: true,
      changesAt: tickAt(2030, 4, 1, 1050),
    });
    expect(instrumentHeadView(WORLD_INDEX, null, EXCHANGES, four, detail()).status).toEqual({
      open: true,
      changesAt: tickAt(2030, 4, 1, 1320),
    });
  });

  it('shows the indicative value of ETFs only from the figures of the same instrument', () => {
    const figures = { id: 'etf-0001', indicativeValue: 94.77 } as InstrumentFigures;
    const head = instrumentHeadView(
      ACCUMULATING,
      null,
      EXCHANGES,
      TEN,
      detail({ figures, figuresTick: TEN }),
    );
    expect(head).toMatchObject({ indicativeValue: 94.77, indicativeTick: TEN });
    const other = { ...figures, id: 'etf-0002' };
    expect(
      instrumentHeadView(ACCUMULATING, null, EXCHANGES, TEN, detail({ figures: other }))
        .indicativeValue,
    ).toBeNull();
    expect(
      instrumentHeadView(
        STOCK,
        null,
        EXCHANGES,
        TEN,
        detail({ figures: { ...figures, id: STOCK.id } }),
      ).indicativeValue,
    ).toBeNull();
  });
});

describe('compositionSegments', () => {
  it('keeps up to six shares with their own colour', () => {
    const shares = ['a', 'b', 'c'].map((key, i) => ({ key, weight: 0.5 - i * 0.1 }));
    expect(compositionSegments(shares).map((segment) => [segment.key, segment.color])).toEqual([
      ['a', 'chart-1'],
      ['b', 'chart-2'],
      ['c', 'chart-3'],
    ]);
  });

  it('sums everything beyond the fifth share into one segment', () => {
    const weights = [0.3, 0.2, 0.15, 0.1, 0.1, 0.05, 0.05, 0.05];
    const shares = weights.map((weight, i) => ({ key: `s${i}`, weight }));
    const segments = compositionSegments(shares);
    expect(segments.map((segment) => segment.key)).toEqual(['s0', 's1', 's2', 's3', 's4', 'other']);
    expect(segments[5].weight).toBeCloseTo(0.15, 12);
    expect(segments[5].color).toBe('chart-6');
  });
});

describe('instrumentDetailView', () => {
  it('leaves out the composition of shares and the dividends of indices', () => {
    const stock = instrumentDetailView(STOCK, detail(), {});
    expect(stock.composition).toBeUndefined();
    expect(stock.dividends).toBeNull();
    const index = instrumentDetailView(EUROPE_INDEX, detail(), {});
    expect(index.composition).toBeNull();
    expect(index.dividends).toBeUndefined();
  });

  it('shows accumulating ETFs without waiting for dividends', () => {
    expect(instrumentDetailView(ACCUMULATING, detail(), {}).dividends).toEqual({
      kind: 'accumulating',
    });
  });

  it('reports a failure only while a part is missing and not for an unknown instrument', () => {
    const error = new Error('x');
    expect(instrumentDetailView(STOCK, detail({ error }), {}).failed).toBe(true);
    const unknown = detail({ error: new EngineCommandError('unknown-instrument'), notFound: true });
    expect(instrumentDetailView(null, unknown, {})).toMatchObject({
      notFound: true,
      failed: false,
    });
  });
});

describe('isUnknownInstrument', () => {
  it('recognises the engine code only', () => {
    expect(isUnknownInstrument(new EngineCommandError('unknown-instrument'))).toBe(true);
    expect(isUnknownInstrument(new EngineCommandError('invalid-command'))).toBe(false);
    expect(isUnknownInstrument(new Error('unknown-instrument'))).toBe(false);
  });
});
