import { stepEtfs } from './etf-step';
import { stepIndices } from './index-step';
import { stepInstrument } from './instrument-step';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { restoreMarket } from './market-snapshot';
import { createMarketDay, createMarketState, stepFactorDay } from './market-step';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, FactorStateEntry, MarketState } from './models/market-state.model';

/** Daily support points of one instrument, one entry per market day. */
export interface InstrumentHistory {
  days: Int32Array;
  idioOpen: Float64Array;
  idioClose: Float64Array;
  logOpen: Float64Array;
  logClose: Float64Array;
  /** Dividend in cents with the ex-date on that day, else 0. */
  exDividendCents: Float64Array;
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
 * `instrumentIndex`, only that instrument is stepped; the fields of the others and the index and
 * ETF fields stay stale. The passed day and state (after the day step, e.g. the factor trends) are
 * reused and only valid during the call.
 */
export function recomputeSupportDays(
  context: MarketContext,
  history: FactorHistory,
  fromDay: number,
  toDay: number,
  onDay: (day: MarketDay, state: Readonly<MarketState>) => void,
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
  onDay: (day: MarketDay, state: Readonly<MarketState>) => void,
): void {
  const entry = monthStartEntry(history, fromDay);
  const state = restoreMarket(entry);
  const allInstruments =
    instruments !== null &&
    instruments.first === 0 &&
    instruments.last === context.layout.instrumentIds.length;
  const out = createMarketDay(context);
  for (let day = entry.day; day < toDay; day++) {
    if (!isMarketDay(day)) {
      continue;
    }
    stepFactorDay(context, state, day, out);
    if (instruments !== null) {
      for (let i = instruments.first; i < instruments.last; i++) {
        stepInstrument(context, i, day, state, out);
      }
    }
    if (allInstruments) {
      stepIndices(context, state, out);
      stepEtfs(context, state, out);
    }
    if (day >= fromDay) {
      onDay(out, state);
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
    exDividendCents: new Float64Array(count),
  };
  // Epoch state; only the entries of this instrument are used.
  const state = createMarketState(context);
  let n = 0;
  recomputeFactorDays(context, history, 0, toDay, (day) => {
    // stepFactorDay has reset the jumps, so the instrument can write into the passed day.
    stepInstrument(context, instrumentIndex, day.day, state, day);
    result.days[n] = day.day;
    result.idioOpen[n] = day.idioOpen[instrumentIndex];
    result.idioClose[n] = day.idioClose[instrumentIndex];
    result.logOpen[n] = day.logOpen[instrumentIndex];
    result.logClose[n] = day.logClose[instrumentIndex];
    result.exDividendCents[n] = day.exDividendCents[instrumentIndex];
    n++;
  });
  return result;
}
