import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { SupportValues } from '@app/market/domain/day-curve';
import { createHighLowFill, HighLowFill } from '@app/market/domain/high-low-fill';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { monthStartEntry, recomputeSupportDays } from '@app/market/domain/market-history';

import { DailyCandleSource } from './daily-candle-source';
import { CANDLE_FIELDS, candleSlot, candleYear } from './daily-candles.utils';
import { DailyCandleBucket, DailyCandlePatch, EngineStorage } from './engine-host.model';

const OPEN = 0;
const HIGH = 1;
const LOW = 2;
const CLOSE = 3;

interface RunningFill {
  /** Newest day of the run. */
  last: number;
  job: HighLowFill;
}

/** Descending, without duplicates. */
function insertDescending(list: number[], day: number): boolean {
  let index = 0;
  while (index < list.length && list[index] > day) {
    index++;
  }
  if (list[index] === day) {
    return false;
  }
  list.splice(index, 0, day);
  return true;
}

function removeDay(list: number[], day: number): boolean {
  const index = list.indexOf(day);
  if (index < 0) {
    return false;
  }
  list.splice(index, 1);
  return true;
}

function previousMarketDay(day: number): number {
  let previous = day - 1;
  while (!isMarketDay(previous)) {
    previous--;
  }
  return previous;
}

/**
 * Background job of the worker host for daily candles (TS §6.8): completes missing opens and
 * closes from the support points (e.g. the prehistory of a new player, a dropped store) and
 * missing highs and lows with `createHighLowFill`, newest days first, opens and closes before
 * highs and lows. What is missing follows from the stored candles (`plan`) and from the batch
 * runs of this session (`addHighLowDays`), so the job goes on after a reload.
 *
 * Work is counted in market days per kind (open/close, high/low). The host gives it time slices;
 * a slice ends after a whole unit (one market day of high and low, or up to one month of opens and
 * closes).
 */
export class CandleBackfill {
  readonly #source: DailyCandleSource;
  readonly #storage: EngineStorage;
  readonly #playerId: string;
  readonly #fromDay: number;
  /** Market days with a missing open or close, descending. */
  readonly #openClose: number[] = [];
  /** Market days with a missing high or low, descending. */
  readonly #highLow: number[] = [];
  #fill?: RunningFill;
  #done = 0;
  #total = 0;

  constructor(
    source: DailyCandleSource,
    storage: EngineStorage,
    playerId: string,
    fromDay: number,
  ) {
    this.#source = source;
    this.#storage = storage;
    this.#playerId = playerId;
    this.#fromDay = fromDay;
  }

  get done(): number {
    return this.#done;
  }

  get total(): number {
    return this.#total;
  }

  /** Whether days before `beforeDay` miss values; later days wait until they are closed. */
  hasWork(beforeDay: number): boolean {
    return (
      this.#openClose.some((day) => day < beforeDay) || this.#highLow.some((day) => day < beforeDay)
    );
  }

  /**
   * Reads the stored candles of the market days in `[fromDay, toDay)` and adds the days where a
   * series misses a value. Call it when no batch run writes days before `toDay`.
   */
  async plan(toDay: number): Promise<void> {
    if (toDay <= this.#fromDay) {
      return;
    }
    const ids = this.#source.ids;
    for (let year = candleYear(toDay - 1); year >= candleYear(this.#fromDay); year--) {
      const buckets = await Promise.all(
        ids.map((id) => this.#storage.loadDailyCandles(this.#playerId, id, year, year)),
      );
      const values = buckets.map((found: DailyCandleBucket[]) => found[0]?.values);
      const first = Math.max(this.#fromDay, dayIndex(dateTimeToTick({ year, month: 1, day: 1 })));
      const end = Math.min(toDay, dayIndex(dateTimeToTick({ year: year + 1, month: 1, day: 1 })));
      for (let day = first; day < end; day++) {
        if (!isMarketDay(day)) {
          continue;
        }
        const offset = candleSlot(day) * CANDLE_FIELDS;
        const missing = (field: number): boolean =>
          values.some((bucket) => bucket === undefined || Number.isNaN(bucket[offset + field]));
        if (missing(OPEN) || missing(CLOSE)) {
          this.#add(this.#openClose, day);
        }
        if (missing(HIGH) || missing(LOW)) {
          this.#add(this.#highLow, day);
        }
      }
    }
  }

  /** Days whose opens and closes a batch run wrote; their highs and lows are missing. */
  addHighLowDays(days: Iterable<number>): void {
    for (const day of days) {
      if (day >= this.#fromDay) {
        this.#add(this.#highLow, day);
      }
    }
  }

  /**
   * Works on days before `beforeDay` (closed and stepped) until `shouldYield`, at least one unit.
   * The candles go to `emit`.
   */
  run(
    beforeDay: number,
    shouldYield: () => boolean,
    emit: (patches: DailyCandlePatch[]) => void,
  ): void {
    do {
      if (!this.#step(beforeDay, emit)) {
        return;
      }
    } while (!shouldYield());
  }

  #add(list: number[], day: number): void {
    if (insertDescending(list, day)) {
      this.#total++;
    }
  }

  #step(beforeDay: number, emit: (patches: DailyCandlePatch[]) => void): boolean {
    const openClose = this.#openClose.find((day) => day < beforeDay);
    if (openClose !== undefined) {
      this.#openClosePart(openClose, emit);
      return true;
    }
    const highLow = this.#highLow.find((day) => day < beforeDay);
    if (highLow !== undefined) {
      this.#highLowDay(highLow, emit);
      return true;
    }
    return false;
  }

  /** Opens and closes of the missing days from `newest` back to its month start. */
  #openClosePart(newest: number, emit: (patches: DailyCandlePatch[]) => void): void {
    const { context, history, ids, tables } = this.#source;
    const monthStart = monthStartEntry(history, newest).day;
    const days = new Set(this.#openClose.filter((day) => day <= newest && day >= monthStart));
    const from = Math.min(...days);
    const patches: DailyCandlePatch[] = [];
    recomputeSupportDays(context, history, from, newest + 1, (marketDay) => {
      if (!days.has(marketDay.day)) {
        return;
      }
      const support = new SupportValues(tables, marketDay);
      ids.forEach((seriesId, series) => {
        patches.push({
          seriesId,
          day: marketDay.day,
          open: support.value(series, 'open'),
          high: Number.NaN,
          low: Number.NaN,
          close: support.value(series, 'close'),
        });
      });
    });
    for (const day of days) {
      removeDay(this.#openClose, day);
      this.#done++;
    }
    emit(patches);
  }

  /** High and low of one day of the run of missing days that ends with `newest`. */
  #highLowDay(newest: number, emit: (patches: DailyCandlePatch[]) => void): void {
    const { context, history, ids, tables } = this.#source;
    if (this.#fill !== undefined && this.#fill.last < newest) {
      // Newer days came in (a batch run): they go first; the rest of the old run stays listed.
      this.#fill = undefined;
    }
    if (this.#fill === undefined) {
      let first = newest;
      for (let previous = previousMarketDay(first); this.#highLow.includes(previous);) {
        first = previous;
        previous = previousMarketDay(previous);
      }
      this.#fill = {
        last: newest,
        job: createHighLowFill(context, history, first, newest + 1, tables),
      };
    }
    const fill = this.#fill;
    const finished = fill.job.run(1, ({ day, high, low }) => {
      emit(
        ids.map((seriesId, series) => ({
          seriesId,
          day,
          open: Number.NaN,
          high: high[series],
          low: low[series],
          close: Number.NaN,
        })),
      );
      if (removeDay(this.#highLow, day)) {
        this.#done++;
      }
      fill.last = day - 1;
    });
    if (finished) {
      this.#fill = undefined;
    }
  }
}
