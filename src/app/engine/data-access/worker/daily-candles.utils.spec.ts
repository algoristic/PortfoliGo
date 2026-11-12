import {
  candleSlot,
  createCandleValues,
  decodeCandleValues,
  marketDaysInYear,
  patchCandleValues,
  slotDay,
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
});
