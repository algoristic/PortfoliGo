import { Candle } from '@app/market/domain/models/candle.model';

import {
  candleSlot,
  createCandleValues,
  decodeCandleValues,
  decodeWeeklyValues,
  isCompleteCandleBucket,
  marketDaysInYear,
  patchCandleValues,
  slotDay,
  weeklyCandleValues,
  weeksInYear,
} from './daily-candles.utils';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_DAY = 86_400_000;
const MS_PER_TICK = 60_000;

/** Day index of a calendar date, independent of the calendar functions (`Date.UTC`). */
function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / MS_PER_DAY;
}

/** Brute-force reference: market days (Monday to Friday) of a year in order, by `Date`. */
function referenceMarketDays(year: number): number[] {
  const days: number[] = [];
  for (let ms = Date.UTC(year, 0, 1); ms < Date.UTC(year + 1, 0, 1); ms += MS_PER_DAY) {
    const weekday = new Date(ms).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push((ms - EPOCH_MS) / MS_PER_DAY);
    }
  }
  return days;
}

describe('daily candle buckets', () => {
  // TS §6.8: slot = index of the market day within its calendar year, weekends left out
  it.each([
    ['01.01.2031 (Wed), first market day', 0, day(2031, 1, 1)],
    ['03.01.2031 (Fri)', 2, day(2031, 1, 3)],
    ['06.01.2031 (Mon), after the weekend', 3, day(2031, 1, 6)],
    ['31.12.2031 (Wed), last market day', 260, day(2031, 12, 31)],
    ['03.01.2033 (Mon), first market day after a Saturday new year', 0, day(2033, 1, 3)],
    ['31.12.2032 (Fri), last market day of a leap year', 261, day(2032, 12, 31)],
  ])('puts %s into slot %i', (_label, slot, marketDay) => {
    expect(candleSlot(marketDay)).toBe(slot);
    expect(slotDay(new Date(EPOCH_MS + marketDay * MS_PER_DAY).getUTCFullYear(), slot)).toBe(
      marketDay,
    );
  });

  it.each([
    [2031, 261],
    [2032, 262],
    [2033, 260],
  ])('counts the market days of %d as %d', (year, count) => {
    expect(marketDaysInYear(year)).toBe(count);
  });

  it('rejects weekend days', () => {
    expect(() => candleSlot(day(2031, 1, 4))).toThrow(RangeError);
  });

  it('numbers the market days of every year 2020–2100 like the brute-force reference', () => {
    for (let year = 2020; year <= 2100; year++) {
      const days = referenceMarketDays(year);
      expect(marketDaysInYear(year), String(year)).toBe(days.length);
      days.forEach((marketDay, slot) => {
        if (candleSlot(marketDay) !== slot || slotDay(year, slot) !== marketDay) {
          throw new Error(`year ${year}: day ${marketDay} is not in slot ${slot}`);
        }
      });
    }
  });

  it('merges patches field by field and decodes the filled days in order', () => {
    const values = createCandleValues(2031);
    const monday = day(2031, 1, 6);
    const friday = day(2031, 1, 3);
    const nan = Number.NaN;
    patchCandleValues(values, {
      seriesId: 's',
      day: monday,
      open: 10,
      high: nan,
      low: nan,
      close: 11,
    });
    patchCandleValues(values, {
      seriesId: 's',
      day: monday,
      open: nan,
      high: 12,
      low: 9.5,
      close: nan,
    });
    patchCandleValues(values, {
      seriesId: 's',
      day: friday,
      open: 8,
      high: nan,
      low: nan,
      close: 9,
    });

    const candles = decodeCandleValues(2031, values);

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({
      tick: (friday * MS_PER_DAY) / MS_PER_TICK,
      open: 8,
      close: 9,
    });
    expect(candles[0].high).toBeNaN();
    expect(candles[1]).toEqual({
      tick: (monday * MS_PER_DAY) / MS_PER_TICK,
      open: 10,
      high: 12,
      low: 9.5,
      close: 11,
    });
  });

  describe('weekly buckets (TS §6.8)', () => {
    /** Monday of the week of a day, by `Date`. */
    function monday(marketDay: number): number {
      const weekday = new Date(EPOCH_MS + marketDay * MS_PER_DAY).getUTCDay();
      return marketDay - ((weekday + 6) % 7);
    }

    /** A complete daily bucket: quarters derived from the slot, exact in float32. */
    function completeYear(year: number): Float32Array {
      const values = createCandleValues(year);
      referenceMarketDays(year).forEach((marketDay, slot) => {
        const base = 100 + ((slot * 37) % 53) / 4;
        patchCandleValues(values, {
          seriesId: 's',
          day: marketDay,
          open: base,
          high: base + 1.5 + (slot % 3) / 4,
          low: base - 1 - (slot % 5) / 4,
          close: base + ((slot % 7) - 3) / 4,
        });
      });
      return values;
    }

    it('counts the weeks touching every year 2020–2100 like the brute-force reference', () => {
      for (let year = 2020; year <= 2100; year++) {
        const first = day(year, 1, 1);
        const last = day(year + 1, 1, 1) - 1;
        expect(weeksInYear(year), String(year)).toBe((monday(last) - monday(first)) / 7 + 1);
      }
    });

    it.each([2031, 2032, 2033])(
      'stores the week parts of %d in its own weekly bucket, each at its first market day',
      (year) => {
        const daily = completeYear(year);
        const groups = new Map<number, Candle[]>();
        for (const candle of decodeCandleValues(year, daily)) {
          const key = monday(candle.tick / (MS_PER_DAY / MS_PER_TICK));
          groups.set(key, [...(groups.get(key) ?? []), candle]);
        }
        const expected = [...groups.values()].map((week) => ({
          tick: week[0].tick,
          open: week[0].open,
          high: Math.max(...week.map(({ high }) => high)),
          low: Math.min(...week.map(({ low }) => low)),
          close: week[week.length - 1].close,
        }));

        const weekly = weeklyCandleValues(year, daily);

        expect(weekly).toHaveLength(weeksInYear(year) * 4);
        expect(decodeWeeklyValues(year, weekly)).toEqual(expected);
      },
    );

    it('starts 2033 with the week of Monday 03.01. (01.01. is a Saturday)', () => {
      const parts = decodeWeeklyValues(2033, weeklyCandleValues(2033, completeYear(2033)));
      expect(parts[0].tick).toBe((day(2033, 1, 3) * MS_PER_DAY) / MS_PER_TICK);
    });

    it('treats a bucket as complete only when every value is present', () => {
      const values = completeYear(2031);
      expect(isCompleteCandleBucket(values)).toBe(true);
      values[4 * 100 + 1] = Number.NaN;
      expect(isCompleteCandleBucket(values)).toBe(false);
    });
  });
});
