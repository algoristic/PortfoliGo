import { Candle } from './models/candle.model';
import {
  overviewSparklineCandles,
  overviewSparklinePoints,
  overviewSparklineRequest,
  overviewSparklineStep,
} from './overview-sparkline-logic';

// Sparklines of the overview indices (US-MK-01, TS §11.3). Ticks come from `Date.UTC` (game minutes
// since 01.01.2020), weekdays from the calendar.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MINUTE_MS = 60_000;

function tick(year: number, month: number, date: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, date, hour, minute) - EPOCH_MS) / MINUTE_MS;
}

function candle(at: number, open = 10, close = 10): Candle {
  return { tick: at, open, high: Math.max(open, close), low: Math.min(open, close), close };
}

describe('overviewSparklineRequest', () => {
  // TS §11.3, table "Zeitfenster der Index-Sparklines": from the start of the market day before.
  it.each([
    ['Mon 01.04.2030 08:00 (before the open)', tick(2030, 4, 1, 8), tick(2030, 3, 29)],
    ['Tue 02.04.2030 12:00 (trading)', tick(2030, 4, 2, 12), tick(2030, 4, 1)],
    ['Sat 06.04.2030 10:00 (weekend)', tick(2030, 4, 6, 10), tick(2030, 4, 4)],
    ['Sun 07.04.2030 23:59', tick(2030, 4, 7, 23, 59), tick(2030, 4, 4)],
  ])('starts on %s at the start of the market day before', (_name, now, from) => {
    expect(overviewSparklineRequest(now)).toEqual({ interval: '15m', from, limit: 2_000 });
  });
});

describe('overviewSparklineCandles', () => {
  it('keeps the candles of the newest day', () => {
    const friday = [candle(tick(2030, 3, 29, 9)), candle(tick(2030, 3, 29, 9, 15))];
    const monday = [candle(tick(2030, 4, 1, 9)), candle(tick(2030, 4, 1, 9, 15))];
    expect(overviewSparklineCandles([...friday, ...monday])).toEqual(monday);
    expect(overviewSparklineCandles(friday)).toEqual(friday);
    expect(overviewSparklineCandles([])).toEqual([]);
  });
});

describe('overviewSparklineStep', () => {
  const loaded = [candle(tick(2030, 4, 1, 9)), candle(tick(2030, 4, 1, 9, 15))];

  it('replaces the running candle and appends the next one', () => {
    expect(overviewSparklineStep(loaded, { candle: candle(tick(2030, 4, 1, 9, 15), 10, 11) })).toBe(
      'replace',
    );
    expect(
      overviewSparklineStep(loaded, {
        candle: candle(tick(2030, 4, 1, 9, 30)),
        previous: loaded[1],
      }),
    ).toBe('append');
  });

  it('loads again when candles were skipped or a new day began', () => {
    expect(
      overviewSparklineStep(loaded, {
        candle: candle(tick(2030, 4, 1, 10)),
        previous: candle(tick(2030, 4, 1, 9, 45)),
      }),
    ).toBe('reload');
    expect(
      overviewSparklineStep(loaded, {
        candle: candle(tick(2030, 4, 2, 9)),
        previous: loaded[1],
      }),
    ).toBe('reload');
    expect(overviewSparklineStep([], { candle: candle(tick(2030, 4, 1, 9)) })).toBe('reload');
  });
});

describe('overviewSparklinePoints', () => {
  it('starts with the open of the day and follows the closes', () => {
    expect(
      overviewSparklinePoints([
        candle(tick(2030, 4, 1, 9), 100, 101),
        candle(tick(2030, 4, 1, 9, 15), 101, 99),
      ]),
    ).toEqual([100, 101, 99]);
    expect(overviewSparklinePoints([])).toEqual([]);
  });
});
