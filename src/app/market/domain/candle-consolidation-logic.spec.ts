import fc from 'fast-check';

import { newestConsolidatedYear, weekParts } from './candle-consolidation-logic';
import { Candle } from './models/candle.model';

// Consolidation of old daily candles (TS §6.8). Days and ticks come from `Date.UTC` (01.01.2020 is
// day 0; tick = game minute); the oracle groups by week with `Date.getUTCDay`.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1_440;

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / DAY_MS;
}

function candle(dayIndex: number, open: number, high: number, low: number, close: number): Candle {
  return { tick: dayIndex * MINUTES_PER_DAY, open, high, low, close };
}

function utcDate(dayIndex: number): Date {
  return new Date(EPOCH_MS + dayIndex * DAY_MS);
}

function isWeekday(dayIndex: number): boolean {
  const weekday = utcDate(dayIndex).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** Brute-force reference: candles grouped by `key`, open first, high max, low min, close last. */
function grouped(daily: readonly Candle[], key: (dayIndex: number) => string): Candle[] {
  const groups = new Map<string, Candle[]>();
  for (const item of daily) {
    const id = key(item.tick / MINUTES_PER_DAY);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return [...groups.values()].map((items) => ({
    tick: items[0].tick,
    open: items[0].open,
    high: Math.max(...items.map(({ high }) => high)),
    low: Math.min(...items.map(({ low }) => low)),
    close: items[items.length - 1].close,
  }));
}

/** Monday of the week of a day, found by stepping back with `Date`. */
function monday(dayIndex: number): number {
  let current = dayIndex;
  while (utcDate(current).getUTCDay() !== 1) {
    current--;
  }
  return current;
}

const arbDaily: fc.Arbitrary<Candle[]> = fc
  .record({
    // From 2020 to 2100, ending in the following two years.
    first: fc.integer({ min: 0, max: 29_000 }),
    length: fc.integer({ min: 1, max: 600 }),
    values: fc.array(
      fc.record({
        open: fc.integer({ min: 4, max: 4_000 }),
        up: fc.integer({ min: 0, max: 40 }),
        down: fc.integer({ min: 0, max: 40 }),
        close: fc.integer({ min: 4, max: 4_000 }),
      }),
      { minLength: 600, maxLength: 600 },
    ),
  })
  .map(({ first, length, values }) => {
    const daily: Candle[] = [];
    for (let d = first; daily.length < length; d++) {
      if (!isWeekday(d)) {
        continue;
      }
      const { open, up, down, close } = values[daily.length];
      // Quarters: exact in float32 like the stored candles.
      daily.push(
        candle(
          d,
          open / 4,
          (Math.max(open, close) + up) / 4,
          (Math.min(open, close) - down) / 4,
          close / 4,
        ),
      );
    }
    return daily;
  });

describe('candle consolidation', () => {
  describe('newestConsolidatedYear', () => {
    // TS §6.8: a year is consolidated once every day of it lies more than 20 game years back.
    it.each([
      [day(2050, 12, 31), 2029],
      [day(2051, 1, 1), 2030],
      [day(2051, 12, 31), 2030],
      [day(2030, 4, 1), 2009],
    ])('consolidates on day %d the years up to %d', (today, year) => {
      expect(newestConsolidatedYear(today)).toBe(year);
    });

    it('keeps fewer years when asked to', () => {
      expect(newestConsolidatedYear(day(2030, 4, 1), 5)).toBe(2024);
    });
  });

  describe('weekParts', () => {
    // TS §6.8 example: the week from Monday 30.12.2030 to Friday 03.01.2031 across the turn of
    // the year (01.01.2031 is a Wednesday).
    const daily = [
      candle(day(2030, 12, 30), 10, 12, 9, 11),
      candle(day(2030, 12, 31), 11, 13, 10, 12),
      candle(day(2031, 1, 1), 12, 12.5, 8, 9),
      candle(day(2031, 1, 2), 9, 10, 8.5, 9.5),
      candle(day(2031, 1, 3), 9.5, 11, 9, 10.5),
    ];

    it('splits a week at the turn of the year into one part per year', () => {
      expect(weekParts(daily)).toEqual([
        candle(day(2030, 12, 30), 10, 13, 9, 12),
        candle(day(2031, 1, 1), 12, 12.5, 8, 10.5),
      ]);
    });

    it('consolidates each year on its own', () => {
      expect([...weekParts(daily.slice(0, 2)), ...weekParts(daily.slice(2))]).toEqual(
        weekParts(daily),
      );
    });

    it('merges whole weeks into one candle at the first market day', () => {
      const week = [
        candle(day(2031, 1, 7), 20, 21, 19, 20.5),
        candle(day(2031, 1, 8), 20.5, 23, 20, 22),
        candle(day(2031, 1, 10), 22, 22.5, 18, 19),
      ];
      expect(weekParts(week)).toEqual([candle(day(2031, 1, 7), 20, 23, 18, 19)]);
    });

    it('equals the aggregation of the daily candles by week and year', () => {
      fc.assert(
        fc.property(arbDaily, (input) => {
          const reference = grouped(input, (d) => `${monday(d)}/${utcDate(d).getUTCFullYear()}`);
          expect(weekParts(input)).toEqual(reference);
        }),
        { numRuns: 50 },
      );
    });

    it('gives the weekly candles when the parts of a week are merged again', () => {
      fc.assert(
        fc.property(arbDaily, fc.integer({ min: 0, max: 599 }), (input, cut) => {
          // Consolidated before the cut (in parts), daily after it: merged per week as the query does.
          const parts = [...weekParts(input.slice(0, cut)), ...input.slice(cut)];
          const byWeek = (d: number): string => `${monday(d)}`;
          const merged = grouped(parts, byWeek).map((item) => ({ ...item, tick: 0 }));
          const expected = grouped(input, byWeek).map((item) => ({ ...item, tick: 0 }));
          expect(merged).toEqual(expected);
        }),
        { numRuns: 50 },
      );
    });
  });
});
