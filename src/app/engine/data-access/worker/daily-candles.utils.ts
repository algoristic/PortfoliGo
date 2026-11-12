import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { isMarketDay, marketDaysBefore } from '@app/market/domain/market-calendar';
import { Candle } from '@app/market/domain/models/candle.model';

import { DailyCandlePatch } from './engine-host.model';

/** Values per candle in a bucket: open, high, low, close. */
export const CANDLE_FIELDS = 4;

function yearStartDay(year: number): number {
  return dayIndex(dateTimeToTick({ year, month: 1, day: 1 }));
}

/** Calendar year of a day; daily candles are stored per year (TS §6.8). */
export function candleYear(day: number): number {
  return tickToDateTime(dayStartTick(day)).year;
}

export function marketDaysInYear(year: number): number {
  return marketDaysBefore(yearStartDay(year + 1)) - marketDaysBefore(yearStartDay(year));
}

/** Index of a market day within its year: the number of market days of the year before it. */
export function candleSlot(day: number): number {
  if (!isMarketDay(day)) {
    throw new RangeError(`candleSlot: day ${day} is not a market day`);
  }
  return marketDaysBefore(day) - marketDaysBefore(yearStartDay(candleYear(day)));
}

/** Market day of a slot (inverse of `candleSlot`). */
export function slotDay(year: number, slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= marketDaysInYear(year)) {
    throw new RangeError(`slotDay: slot ${slot} is outside of ${year}`);
  }
  let remaining = slot;
  let day = yearStartDay(year);
  for (;;) {
    if (isMarketDay(day)) {
      if (remaining === 0) {
        return day;
      }
      remaining--;
    }
    day++;
  }
}

/** Empty bucket of a year: every value `NaN`. */
export function createCandleValues(year: number): Float32Array {
  return new Float32Array(marketDaysInYear(year) * CANDLE_FIELDS).fill(Number.NaN);
}

/** Writes the non-`NaN` fields of a patch into its slot. */
export function patchCandleValues(values: Float32Array, patch: DailyCandlePatch): void {
  const offset = candleSlot(patch.day) * CANDLE_FIELDS;
  const fields = [patch.open, patch.high, patch.low, patch.close];
  for (let f = 0; f < CANDLE_FIELDS; f++) {
    if (!Number.isNaN(fields[f])) {
      values[offset + f] = fields[f];
    }
  }
}

/** Candles of a bucket in ascending order; slots without open and close are left out. */
export function decodeCandleValues(year: number, values: Float32Array): Candle[] {
  const candles: Candle[] = [];
  const firstDay = yearStartDay(year);
  let slot = 0;
  for (let day = firstDay; slot * CANDLE_FIELDS < values.length; day++) {
    if (!isMarketDay(day)) {
      continue;
    }
    const offset = slot * CANDLE_FIELDS;
    slot++;
    const [open, high, low, close] = values.subarray(offset, offset + CANDLE_FIELDS);
    if (Number.isNaN(open) && Number.isNaN(close)) {
      continue;
    }
    candles.push({ tick: dayStartTick(day), open, high, low, close });
  }
  return candles;
}
