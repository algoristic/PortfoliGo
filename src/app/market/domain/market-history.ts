import { FactorState } from './factor-step';
import { stepInstrument } from './instrument-step';
import { MarketContext } from './market-context';
import { createMarketDay, isMarketDay, stepFactorDay } from './market-step';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, FactorStateEntry } from './models/market-state.model';

/** Daily support points of one instrument, one entry per market day. */
export interface InstrumentHistory {
  days: Int32Array;
  idioOpen: Float64Array;
  idioClose: Float64Array;
  logOpen: Float64Array;
  logClose: Float64Array;
}

export function createFactorHistory(): FactorHistory {
  return { monthStarts: [] };
}

/**
 * Recomputes the factor part of the market days in `[fromDay, toDay)` from the closest month
 * start state (TS §6.8). Instrument fields of the passed day are not filled.
 */
export function recomputeFactorDays(
  context: MarketContext,
  history: FactorHistory,
  fromDay: number,
  toDay: number,
  onDay: (day: MarketDay) => void,
): void {
  recomputeDays(context, history, fromDay, toDay, null, onDay);
}

/**
 * Recomputes the complete support points of the market days in `[fromDay, toDay)` from the
 * closest month start state, bit for bit equal to the day steps of the original run. With
 * `instrumentIndex`, only that instrument is stepped; the fields of the others stay stale.
 * The passed day is reused and only valid during the call.
 */
export function recomputeSupportDays(
  context: MarketContext,
  history: FactorHistory,
  fromDay: number,
  toDay: number,
  onDay: (day: MarketDay) => void,
  instrumentIndex?: number,
): void {
  const count = context.layout.instrumentIds.length;
  const first = instrumentIndex ?? 0;
  const last = instrumentIndex === undefined ? count : instrumentIndex + 1;
  recomputeDays(context, history, fromDay, toDay, { first, last }, onDay);
}

/** Last month start entry at or before `day`. */
export function monthStartEntry(history: FactorHistory, day: number): FactorStateEntry {
  let index = history.monthStarts.length - 1;
  while (index >= 0 && history.monthStarts[index].day > day) {
    index--;
  }
  if (index < 0) {
    throw new RangeError(`market history: no state before day ${day}`);
  }
  return history.monthStarts[index];
}

function recomputeDays(
  context: MarketContext,
  history: FactorHistory,
  fromDay: number,
  toDay: number,
  instruments: { first: number; last: number } | null,
  onDay: (day: MarketDay) => void,
): void {
  const entry = monthStartEntry(history, fromDay);
  const state: FactorState = {
    phase: entry.phase,
    trend: entry.trend.slice(),
    logVol: entry.logVol.slice(),
    level: entry.level.slice(),
  };
  const idioClose = entry.idioClose.slice();
  const out = createMarketDay(context.layout);
  for (let day = entry.day; day < toDay; day++) {
    if (!isMarketDay(day)) {
      continue;
    }
    stepFactorDay(context, state, day, out);
    if (instruments !== null) {
      for (let i = instruments.first; i < instruments.last; i++) {
        idioClose[i] = stepInstrument(context, i, day, idioClose[i], out);
      }
    }
    if (day >= fromDay) {
      onDay(out);
    }
  }
}

/**
 * Recomputes the daily support points of a single instrument from the epoch up to `toDay`
 * (exclusive), using only the factor history and the instrument's own streams (TS §6.8).
 */
export function recomputeInstrumentHistory(
  context: MarketContext,
  history: FactorHistory,
  instrumentIndex: number,
  toDay: number,
): InstrumentHistory {
  let count = 0;
  for (let day = 0; day < toDay; day++) {
    if (isMarketDay(day)) {
      count++;
    }
  }
  const result: InstrumentHistory = {
    days: new Int32Array(count),
    idioOpen: new Float64Array(count),
    idioClose: new Float64Array(count),
    logOpen: new Float64Array(count),
    logClose: new Float64Array(count),
  };
  let idioClose = 0;
  let n = 0;
  recomputeFactorDays(context, history, 0, toDay, (day) => {
    // stepFactorDay has reset the jumps, so the instrument can write into the passed day.
    idioClose = stepInstrument(context, instrumentIndex, day.day, idioClose, day);
    result.days[n] = day.day;
    result.idioOpen[n] = day.idioOpen[instrumentIndex];
    result.idioClose[n] = idioClose;
    result.logOpen[n] = day.logOpen[instrumentIndex];
    result.logClose[n] = day.logClose[instrumentIndex];
    n++;
  });
  return result;
}
