import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { DAYS_PER_WEEK } from '@app/clock/domain/models/time.model';
import { weekParts } from '@app/market/domain/candle-consolidation-logic';
import { weekStartDay } from '@app/market/domain/candle-window';
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

/** Whether every slot of a daily bucket holds all four values (the job has completed it). */
export function isCompleteCandleBucket(values: Float32Array): boolean {
  return values.every((value) => !Number.isNaN(value));
}

/**
 * Weeks touching a calendar year, the slots of its weekly bucket (TS §6.8): slot 0 is the week of
 * 1 January (from its Monday, possibly in the year before).
 */
export function weeksInYear(year: number): number {
  return weekSlot(year, yearStartDay(year + 1) - 1) + 1;
}

/** Slot of the week of `day` in the weekly bucket of its calendar year. */
function weekSlot(year: number, day: number): number {
  return (weekStartDay(day) - weekStartDay(yearStartDay(year))) / DAYS_PER_WEEK;
}

/**
 * Weekly bucket of a calendar year from its complete daily bucket (TS §6.8): one part per week
 * within the year (`weekParts`), `values[4 · slot + f]`; weeks without a market day in the year
 * stay `NaN`.
 */
export function weeklyCandleValues(year: number, daily: Float32Array): Float32Array {
  const values = new Float32Array(weeksInYear(year) * CANDLE_FIELDS).fill(Number.NaN);
  for (const part of weekParts(decodeCandleValues(year, daily))) {
    const offset = weekSlot(year, dayIndex(part.tick)) * CANDLE_FIELDS;
    values.set([part.open, part.high, part.low, part.close], offset);
  }
  return values;
}

/**
 * Week parts of a weekly bucket in ascending order, each at its first market day in the year;
 * slots without values are left out.
 */
export function decodeWeeklyValues(year: number, values: Float32Array): Candle[] {
  const candles: Candle[] = [];
  const firstDay = yearStartDay(year);
  const firstWeek = weekStartDay(firstDay);
  for (let slot = 0; slot * CANDLE_FIELDS < values.length; slot++) {
    const offset = slot * CANDLE_FIELDS;
    const [open, high, low, close] = values.subarray(offset, offset + CANDLE_FIELDS);
    if (Number.isNaN(open) && Number.isNaN(close)) {
      continue;
    }
    let day = Math.max(firstDay, firstWeek + slot * DAYS_PER_WEEK);
    while (!isMarketDay(day)) {
      day++;
    }
    candles.push({ tick: dayStartTick(day), open, high, low, close });
  }
  return candles;
}
