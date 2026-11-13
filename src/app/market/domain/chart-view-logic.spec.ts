import fc from 'fast-check';

import {
  applyLiveCandle,
  CHART_RANGE_INTERVALS,
  chartBlockStartDay,
  chartInterval,
  chartResolutions,
  chartStartRequest,
  chosenChartDay,
  isChartResolutionAllowed,
  keptChartResolution,
  liveCandleStep,
  nextChartDay,
  olderChartRequest,
  prependCandles,
  previousChartDay,
  shownChartDay,
  trimChartBlock,
} from './chart-view-logic';
import { Candle, CANDLE_RESOLUTIONS } from './models/candle.model';
import { CHART_RANGES } from './models/chart.model';

// Views of the price chart (US-CH-01, TS §11.7). Days and ticks come from `Date.UTC`
// (01.01.2020 is day 0, a Wednesday; tick = game minute), weekdays from `Date.getUTCDay`.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const LIMIT = 2_000;

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / DAY_MS;
}

function tick(year: number, month: number, date: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, date, hour, minute) - EPOCH_MS) / MINUTE_MS;
}

function candle(at: number, close = 10): Candle {
  return { tick: at, open: 10, high: 11, low: 9, close };
}

describe('chart view logic', () => {
  describe('CHART_RANGE_INTERVALS', () => {
    // TS §11.7: resolution per period.
    it.each([
      ['1d', '1m'],
      ['5d', '15m'],
      ['1m', '1h'],
      ['6m', '1d'],
      ['1y', '1d'],
      ['5y', '1w'],
      ['max', '1w'],
    ] as const)('shows %s in %s candles', (range, interval) => {
      expect(CHART_RANGE_INTERVALS[range]).toBe(interval);
    });
  });

  describe('isChartResolutionAllowed', () => {
    // TS §11.7, AP 5.8: a period holds more than one candle and at most 2,000, counted with
    // 1,440 minute candles a day; intraday at most 23 market days. Periods in market days at most:
    // 1T 1, 5T 5, a month 23, 6M 138, 1J 276, 5J 1,380, Max unbounded.
    it.each([
      ['1d', ['1m', '5m', '15m', '1h']],
      ['5d', ['5m', '15m', '1h', '1d']],
      ['1m', ['1h', '1d', '1w']],
      ['6m', ['1d', '1w']],
      ['1y', ['1d', '1w']],
      ['5y', ['1d', '1w']],
      ['max', []],
    ] as const)('lets %s choose %j', (range, allowed) => {
      expect(chartResolutions(range)).toEqual(allowed);
      for (const resolution of CANDLE_RESOLUTIONS) {
        expect(isChartResolutionAllowed(range, resolution)).toBe(
          (allowed as readonly string[]).includes(resolution),
        );
      }
    });
  });

  describe('keptChartResolution and chartInterval', () => {
    // TS §11.7: the chosen resolution stays with a new period while allowed, else „Auto“.
    it.each([
      ['1h', '1d', '1h'],
      ['1h', '1m', '1h'],
      ['1h', '6m', null],
      ['5m', '5d', '5m'],
      ['5m', '1m', null],
      ['1d', '5d', '1d'],
      ['1d', '1d', null],
      ['1w', '5y', '1w'],
      ['1w', 'max', null],
      [null, '1y', null],
    ] as const)('keeps %s for %s as %s', (resolution, range, expected) => {
      expect(keptChartResolution(range, resolution)).toBe(expected);
    });

    it('loads the chosen resolution, otherwise the automatic one', () => {
      expect(chartInterval('1m', '1d')).toBe('1d');
      expect(chartInterval('1m', null)).toBe('1h');
      expect(chartInterval('max', null)).toBe('1w');
    });

    it('keeps a resolution exactly when it is allowed for the new period', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...CHART_RANGES),
          fc.constantFrom(...CANDLE_RESOLUTIONS),
          (range, resolution) => {
            const kept = keptChartResolution(range, resolution);
            expect(kept === resolution).toBe(isChartResolutionAllowed(range, resolution));
            expect(kept === null || kept === resolution).toBe(true);
          },
        ),
      );
    });
  });

  describe('chartBlockStartDay', () => {
    it.each([
      ['1d', day(2030, 4, 3), day(2030, 4, 3)],
      ['1d', day(2030, 3, 31), day(2030, 3, 29)],
      ['5d', day(2030, 4, 3), day(2030, 3, 28)],
      ['1m', day(2030, 4, 3), day(2030, 3, 3)],
      ['6m', day(2030, 8, 31), day(2030, 2, 28)],
      ['1y', day(2030, 4, 3), day(2029, 4, 3)],
      ['5y', day(2030, 4, 3), day(2025, 4, 3)],
      ['max', day(2030, 4, 3), null],
    ] as const)('starts a %s block ending on day %d on day %s', (range, lastDay, expected) => {
      expect(chartBlockStartDay(range, lastDay)).toBe(expected);
    });

    it('never starts before the first market day for market-day periods', () => {
      expect(chartBlockStartDay('5d', day(2020, 1, 2))).toBe(0);
    });
  });

  describe('chartStartRequest', () => {
    it('loads the whole chosen day', () => {
      expect(chartStartRequest('1d', day(2025, 6, 4), tick(2030, 4, 3, 12))).toEqual({
        interval: '1m',
        from: tick(2025, 6, 4),
        to: tick(2025, 6, 4, 23, 59),
        limit: LIMIT,
      });
    });

    it('reaches one market day further back for live 1T and 5T', () => {
      // Mon 01.04.2030 before the open: Friday must still be in the block.
      const now = tick(2030, 4, 1, 8);
      expect(chartStartRequest('1d', null, now)).toEqual({
        interval: '1m',
        from: tick(2030, 3, 29),
        limit: LIMIT,
      });
      expect(chartStartRequest('5d', null, now)).toEqual({
        interval: '15m',
        from: tick(2030, 3, 25),
        limit: LIMIT,
      });
    });

    it('starts live month periods on the same date back and max at the epoch', () => {
      const now = tick(2030, 6, 15, 10);
      expect(chartStartRequest('1m', null, now)).toEqual({
        interval: '1h',
        from: tick(2030, 5, 15),
        limit: LIMIT,
      });
      expect(chartStartRequest('5y', null, now)).toEqual({
        interval: '1w',
        from: tick(2025, 6, 15),
        limit: LIMIT,
      });
      expect(chartStartRequest('max', null, now)).toEqual({ interval: '1w', limit: LIMIT });
    });
  });

  describe('chartStartRequest with a chosen resolution', () => {
    it('loads the period of the range in the chosen resolution', () => {
      const now = tick(2030, 4, 1, 8);
      expect(chartStartRequest('5d', null, now, '1d')).toEqual({
        interval: '1d',
        from: tick(2030, 3, 25),
        limit: LIMIT,
      });
      expect(chartStartRequest('1d', day(2025, 6, 4), now, '5m')).toEqual({
        interval: '5m',
        from: tick(2025, 6, 4),
        to: tick(2025, 6, 4, 23, 59),
        limit: LIMIT,
      });
      expect(chartStartRequest('1y', null, tick(2030, 6, 15, 10), '1w')).toEqual({
        interval: '1w',
        from: tick(2029, 6, 15),
        limit: LIMIT,
      });
    });
  });

  describe('trimChartBlock', () => {
    const block = {
      candles: [
        candle(tick(2030, 3, 28, 9)),
        candle(tick(2030, 3, 29, 9)),
        candle(tick(2030, 3, 29, 9, 1)),
        candle(tick(2030, 4, 1, 9)),
        candle(tick(2030, 4, 1, 9, 1)),
      ],
      hasOlder: false,
    };

    it('keeps the newest day for live 1T and reports the rest as older', () => {
      expect(trimChartBlock('1d', null, block)).toEqual({
        candles: block.candles.slice(3),
        hasOlder: true,
      });
    });

    it('keeps blocks with few enough days, chosen days and other periods', () => {
      expect(trimChartBlock('5d', null, block)).toBe(block);
      expect(trimChartBlock('1d', day(2030, 4, 1), block)).toBe(block);
      expect(trimChartBlock('1m', null, block)).toBe(block);
      const oneDay = { candles: block.candles.slice(3), hasOlder: false };
      expect(trimChartBlock('1d', null, oneDay)).toBe(oneDay);
      const empty = { candles: [], hasOlder: true };
      expect(trimChartBlock('1d', null, empty)).toBe(empty);
    });

    it('keeps the last five days of a 5T block with six', () => {
      const days = [25, 26, 27, 28, 29].map((date) => candle(tick(2030, 3, date, 9)));
      const trimmed = trimChartBlock('5d', null, {
        candles: [candle(tick(2030, 3, 22, 9)), ...days],
        hasOlder: false,
      });
      expect(trimmed).toEqual({ candles: days, hasOlder: true });
    });
  });

  describe('olderChartRequest', () => {
    it('loads the day before an intraday block as a whole day', () => {
      expect(olderChartRequest('1d', tick(2030, 4, 1, 9))).toEqual({
        interval: '1m',
        from: tick(2030, 3, 29),
        to: tick(2030, 3, 31, 23, 59),
        limit: LIMIT,
      });
      expect(olderChartRequest('1m', tick(2030, 4, 1, 9))).toEqual({
        interval: '1h',
        from: tick(2030, 2, 28),
        to: tick(2030, 3, 31, 23, 59),
        limit: LIMIT,
      });
    });

    it('loads one more period before daily and weekly candles', () => {
      expect(olderChartRequest('1y', tick(2029, 4, 2))).toEqual({
        interval: '1d',
        from: tick(2028, 4, 1),
        to: tick(2029, 4, 1, 23, 59),
        limit: LIMIT,
      });
      expect(olderChartRequest('max', tick(2025, 1, 6))).toEqual({
        interval: '1w',
        to: tick(2025, 1, 5, 23, 59),
        limit: LIMIT,
      });
    });

    it('loads older blocks in the chosen resolution', () => {
      expect(olderChartRequest('1d', tick(2030, 4, 1, 9), '15m')).toEqual({
        interval: '15m',
        from: tick(2030, 3, 29),
        to: tick(2030, 3, 31, 23, 59),
        limit: LIMIT,
      });
      expect(olderChartRequest('1m', tick(2030, 4, 1), '1d')).toEqual({
        interval: '1d',
        from: tick(2030, 2, 28),
        to: tick(2030, 3, 31, 23, 59),
        limit: LIMIT,
      });
    });

    it('ends every block before the oldest candle and starts it no later', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...CHART_RANGES),
          fc.integer({ min: tick(2020, 2, 1), max: tick(2040, 1, 1) }),
          (range, oldest) => {
            const request = olderChartRequest(range, oldest);
            expect(request.to).toBeLessThan(oldest);
            if (request.from !== undefined && request.to !== undefined) {
              expect(request.from).toBeLessThanOrEqual(request.to);
            }
          },
        ),
      );
    });
  });

  describe('prependCandles', () => {
    it('puts older candles in front and drops shared ones', () => {
      const loaded = [candle(20), candle(30)];
      expect(prependCandles([candle(0), candle(10), candle(20, 99)], loaded)).toEqual([
        candle(0),
        candle(10),
        candle(20),
        candle(30),
      ]);
      expect(prependCandles([candle(0)], [])).toEqual([candle(0)]);
    });
  });

  describe('day navigation', () => {
    const now = tick(2030, 4, 3, 12); // Wed

    it('shows the chosen day, live the day of the newest candle or the last market day', () => {
      expect(shownChartDay(day(2030, 3, 1), [], now)).toBe(day(2030, 3, 1));
      expect(shownChartDay(null, [candle(tick(2030, 4, 2, 17))], now)).toBe(day(2030, 4, 2));
      expect(shownChartDay(null, [], tick(2030, 4, 7, 12))).toBe(day(2030, 4, 5));
    });

    it.each([
      ['Thu → Wed', day(2030, 4, 4), day(2030, 4, 3)],
      ['Mon → Fri', day(2030, 4, 1), day(2030, 3, 29)],
      ['Thu 02.01.2020 → Wed 01.01.2020', day(2020, 1, 2), 0],
      ['the first market day has none', 0, null],
    ])('goes back %s', (_label, from, expected) => {
      expect(previousChartDay(from)).toBe(expected);
    });

    it.each([
      ['Fri → Mon', day(2030, 3, 29), day(2030, 4, 1)],
      ['Mon → Tue', day(2030, 4, 1), day(2030, 4, 2)],
      ['Tue → live (today)', day(2030, 4, 2), null],
    ])('goes forward %s', (_label, from, expected) => {
      expect(nextChartDay(from, now)).toBe(expected);
    });

    it.each([
      ['a past market day', day(2025, 6, 4), day(2025, 6, 4)],
      ['a Sunday → Friday', day(2025, 6, 8), day(2025, 6, 6)],
      ['before the epoch → first market day', day(2019, 12, 20), 0],
      ['today → live', day(2030, 4, 3), null],
      ['the future → live', day(2031, 1, 1), null],
    ])('chooses %s', (_label, chosen, expected) => {
      expect(chosenChartDay(chosen, now)).toBe(expected);
    });

    it('steps over every market day and only those', () => {
      // Oracle: weekdays from `Date.getUTCDay`.
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 4000 }), (from) => {
          const previous = previousChartDay(from);
          expect(previous).not.toBeNull();
          const weekday = new Date(EPOCH_MS + (previous as number) * DAY_MS).getUTCDay();
          expect(weekday).not.toBe(0);
          expect(weekday).not.toBe(6);
          expect(from - (previous as number)).toBeLessThanOrEqual(3);
          expect(nextChartDay(previous as number, tick(2040, 1, 1))).toBeGreaterThanOrEqual(from);
        }),
      );
    });
  });

  describe('liveCandleStep and applyLiveCandle', () => {
    const loaded = [candle(tick(2030, 4, 1, 9)), candle(tick(2030, 4, 1, 9, 1))];
    const last = loaded[1];
    const next = candle(tick(2030, 4, 1, 9, 2));

    it.each([
      ['replaces the running candle', '1d', { candle: candle(last.tick, 12) }, 'replace'],
      ['ignores older candles', '1d', { candle: candle(loaded[0].tick) }, 'ignore'],
      ['appends after the finished one', '1d', { candle: next, previous: last }, 'append'],
      ['reloads without previous', '1d', { candle: next }, 'reload'],
      ['reloads after skipped candles', '1d', { candle: next, previous: loaded[0] }, 'reload'],
      [
        'reloads 1T on a new day',
        '1d',
        { candle: candle(tick(2030, 4, 2, 9)), previous: last },
        'reload',
      ],
      [
        'appends a new day to 5T',
        '5d',
        { candle: candle(tick(2030, 4, 2, 9)), previous: last },
        'append',
      ],
    ] as const)('%s', (_label, range, live, expected) => {
      expect(liveCandleStep(range, loaded, live)).toBe(expected);
    });

    it('reloads an empty chart', () => {
      expect(liveCandleStep('1y', [], { candle: next })).toBe('reload');
    });

    it('replaces, appends or keeps the loaded candles', () => {
      const running = candle(last.tick, 12);
      const finished = candle(last.tick, 13);
      expect(applyLiveCandle(loaded, { candle: running }, 'replace')).toEqual([loaded[0], running]);
      expect(applyLiveCandle(loaded, { candle: next, previous: finished }, 'append')).toEqual([
        loaded[0],
        finished,
        next,
      ]);
      expect(applyLiveCandle(loaded, { candle: next }, 'reload')).toBe(loaded);
      expect(applyLiveCandle(loaded, { candle: next }, 'ignore')).toBe(loaded);
    });
  });
});
