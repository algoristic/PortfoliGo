import { candleEnd, ChartTrade, tradeMarkers } from './chart-marker-logic';
import { Candle } from './models/candle.model';

const DAY = 1_440;

function candle(tick: number): Candle {
  return { tick, open: 1, high: 1, low: 1, close: 1 };
}

describe('candleEnd', () => {
  // TS §11.7: a candle covers [start, end); intraday by its minutes, days and weeks by the calendar.
  it.each([
    [570, '1m', 571],
    [570, '5m', 575],
    [570, '15m', 585],
    [540, '1h', 600],
    [DAY * 3 + 540, '1d', DAY * 4],
    [DAY * 3, '1d', DAY * 4],
    [-2 * DAY, '1w', 5 * DAY],
    [5 * DAY, '1w', 12 * DAY],
  ] as const)('ends the candle at %d (%s) at %d', (tick, resolution, expected) => {
    expect(candleEnd(tick, resolution)).toBe(expected);
  });
});

describe('tradeMarkers', () => {
  // TS §11.7 (AP 5.5): 15-minute candles at 09:00, 09:15 and 09:45 of day 0 (a gap at 09:30).
  const candles = [candle(540), candle(555), candle(585)];

  it.each([
    ['at the start of a candle', 540, 540],
    ['inside a candle', 554, 540],
    ['at the next candle', 555, 555],
    ['in the last candle', 599, 585],
  ])('places a trade %s on its candle', (_case, tick, expected) => {
    const trades: ChartTrade[] = [{ id: 'o1', tick, side: 'buy' }];
    expect(tradeMarkers(trades, candles, '15m')).toEqual([
      { id: 'o1', tick: expected, side: 'buy' },
    ]);
  });

  it.each([
    ['before the first candle', 539],
    ['in the gap after a candle', 570],
    ['after the last candle', 600],
  ])('drops a trade %s', (_case, tick) => {
    expect(tradeMarkers([{ id: 'o1', tick, side: 'sell' }], candles, '15m')).toEqual([]);
  });

  it('sorts the markers by time and keeps the input order of ties', () => {
    const trades: ChartTrade[] = [
      { id: 'late', tick: 590, side: 'sell' },
      { id: 'first', tick: 541, side: 'buy' },
      { id: 'second', tick: 550, side: 'sell' },
    ];
    expect(tradeMarkers(trades, candles, '15m').map(({ id }) => id)).toEqual([
      'first',
      'second',
      'late',
    ]);
  });

  it('places trades on day candles that start at the open', () => {
    const days = [candle(DAY + 540), candle(2 * DAY + 540)];
    const trades: ChartTrade[] = [
      { id: 'a', tick: DAY + 600, side: 'buy' },
      { id: 'b', tick: 2 * DAY + 1_000, side: 'sell' },
      { id: 'c', tick: 3 * DAY + 600, side: 'sell' },
    ];
    expect(tradeMarkers(trades, days, '1d')).toEqual([
      { id: 'a', tick: DAY + 540, side: 'buy' },
      { id: 'b', tick: 2 * DAY + 540, side: 'sell' },
    ]);
  });

  it('gives no markers without candles', () => {
    expect(tradeMarkers([{ id: 'o1', tick: 0, side: 'buy' }], [], '1m')).toEqual([]);
  });
});
