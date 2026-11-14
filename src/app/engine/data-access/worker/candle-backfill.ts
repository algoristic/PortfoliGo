import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { DayCurves, SupportValues } from '@app/market/domain/day-curve';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { monthStartEntry, recomputeSupportDays } from '@app/market/domain/market-history';
import { copyMarketDay } from '@app/market/domain/market-step';
import { MarketDay } from '@app/market/domain/models/market-day.model';

import { DailyCandleSource } from './daily-candle-source';
import { CANDLE_FIELDS, candleSlot, candleYear } from './daily-candles.utils';
import { DailyCandleBucket, DailyCandlePatch, EngineStorage } from './engine-host.model';

const OPEN = 0;
const HIGH = 1;
const LOW = 2;
const CLOSE = 3;

type WorkKind = 'open-close' | 'high-low';

/** The day the job works on: one series after the other, the candles go out when all are done. */
interface DayWork {
  kind: WorkKind;
  day: number;
  /** Next series to compute. */
  next: number;
  support?: SupportValues;
  open: Float64Array;
  close: Float64Array;
  high: Float64Array;
  low: Float64Array;
  /** Computing time spent on this day so far. */
  costMs: number;
}

/** Support points of the market days `[from, to)` of one month, recomputed from its month start. */
interface LoadedMonth {
  from: number;
  to: number;
  days: Map<number, MarketDay>;
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

/** Cost estimate per unit: rises at once, falls slowly. */
function nextEstimate(estimate: number, measured: number): number {
  return measured >= estimate ? measured : estimate + (measured - estimate) * 0.25;
}

/**
 * Background job of the worker host for daily candles (TS §6.8): completes missing opens and
 * closes from the support points (e.g. the prehistory of a new player, a dropped store) and
 * missing highs and lows from the minute curves, newest days first, opens and closes before highs
 * and lows. What is missing follows from the stored candles (`plan`) and from the days this session
 * wrote without high and low (`addHighLowDays`), so the job goes on after a reload.
 *
 * Work is counted in market days per kind (open/close, high/low). The host gives it time slices
 * (`runSlice`); the job cuts its work into small units – the support points of a month, then one
 * series of one day – and starts a unit only if its estimated cost fits into the rest of the
 * slice. Only a unit that is larger than a whole slice runs in a slice of full length.
 */
export class CandleBackfill {
  readonly #source: DailyCandleSource;
  readonly #storage: EngineStorage;
  readonly #playerId: string;
  readonly #fromDay: number;
  readonly #fullSliceMs: number;
  /** Market days with a missing open or close, descending. */
  readonly #openClose: number[] = [];
  /** Market days with a missing high or low, descending. */
  readonly #highLow: number[] = [];
  readonly #curves: DayCurves;
  #month?: LoadedMonth;
  #work?: DayWork;
  /** Estimated milliseconds per recomputed day and per series of each kind. */
  #stepEstimate = 0;
  readonly #seriesEstimate: Record<WorkKind, number> = { 'open-close': 0, 'high-low': 0 };
  #done = 0;
  #total = 0;

  constructor(
    source: DailyCandleSource,
    storage: EngineStorage,
    playerId: string,
    fromDay: number,
    fullSliceMs: number,
  ) {
    this.#source = source;
    this.#storage = storage;
    this.#playerId = playerId;
    this.#fromDay = fromDay;
    this.#fullSliceMs = fullSliceMs;
    this.#curves = new DayCurves(source.tables);
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

  /** Whether days of the calendar year `year` miss values (the consolidation waits for them). */
  hasWorkIn(year: number): boolean {
    const inYear = (day: number): boolean => candleYear(day) === year;
    return this.#openClose.some(inYear) || this.#highLow.some(inYear);
  }

  /**
   * Reads the stored candles of the market days in `[fromDay, toDay)` and adds the days where a
   * series misses a value; consolidated years (weekly candles, TS §6.8) have no daily candles and
   * are left out. Call it when no batch run writes days before `toDay`.
   */
  async plan(toDay: number, consolidated: ReadonlySet<number> = new Set()): Promise<void> {
    if (toDay <= this.#fromDay) {
      return;
    }
    const ids = this.#source.ids;
    for (let year = candleYear(toDay - 1); year >= candleYear(this.#fromDay); year--) {
      if (consolidated.has(year)) {
        continue;
      }
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

  /** Days written with open and close only (batch runs, fast live speeds); high and low follow. */
  addHighLowDays(days: Iterable<number>): void {
    for (const day of days) {
      if (day >= this.#fromDay) {
        this.#add(this.#highLow, day);
      }
    }
  }

  /**
   * Works on days before `beforeDay` (closed and stepped) for at most about `budgetMs`, measured
   * with `now`; returns the milliseconds spent. Completed days go to `emit`.
   */
  runSlice(
    beforeDay: number,
    now: () => number,
    budgetMs: number,
    emit: (patches: DailyCandlePatch[]) => void,
  ): number {
    const start = now();
    const deadline = start + budgetMs;
    for (let units = 0; ; units++) {
      const day = this.#nextDay(beforeDay);
      if (day === undefined) {
        break;
      }
      const monthCost = this.#work === undefined ? this.#monthCost(day.day) : undefined;
      const estimate = monthCost ?? this.#seriesEstimate[day.kind];
      const unitStart = now();
      const remaining = deadline - unitStart;
      const fits = remaining > 0 && estimate <= remaining;
      const overlong = units === 0 && estimate > this.#fullSliceMs && budgetMs >= this.#fullSliceMs;
      if (!fits && !overlong) {
        break;
      }
      if (monthCost === undefined) {
        this.#series(day, now, emit);
      } else {
        const steps = this.#loadMonth(day.day);
        this.#stepEstimate = nextEstimate(this.#stepEstimate, (now() - unitStart) / steps);
      }
    }
    return now() - start;
  }

  #add(list: number[], day: number): void {
    if (insertDescending(list, day)) {
      this.#total++;
    }
  }

  /** Newest day with missing opens or closes, else newest day with missing highs or lows. */
  #nextDay(beforeDay: number): { kind: WorkKind; day: number } | undefined {
    const work = this.#work;
    if (work !== undefined) {
      return work;
    }
    const openClose = this.#openClose.find((day) => day < beforeDay);
    if (openClose !== undefined) {
      return { kind: 'open-close', day: openClose };
    }
    const highLow = this.#highLow.find((day) => day < beforeDay);
    return highLow === undefined ? undefined : { kind: 'high-low', day: highLow };
  }

  /** Estimated cost of loading the month of `day`, or `undefined` when it is loaded. */
  #monthCost(day: number): number | undefined {
    const month = this.#month;
    if (month !== undefined && day >= month.from && day < month.to) {
      return undefined;
    }
    const from = monthStartEntry(this.#source.history, day).day;
    return (day + 1 - from) * this.#stepEstimate;
  }

  /** Recomputes the support points from the month start of `day` to `day`; returns the days. */
  #loadMonth(day: number): number {
    const { context, history } = this.#source;
    const from = monthStartEntry(history, day).day;
    const days = new Map<number, MarketDay>();
    recomputeSupportDays(context, history, from, day + 1, (marketDay) => {
      days.set(marketDay.day, copyMarketDay(marketDay));
    });
    this.#month = { from, to: day + 1, days };
    return Math.max(1, days.size);
  }

  /** One series of the current day; starts the day if needed and emits it when complete. */
  #series(
    next: { kind: WorkKind; day: number },
    now: () => number,
    emit: (patches: DailyCandlePatch[]) => void,
  ): void {
    const started = now();
    const { ids, tables } = this.#source;
    const count = ids.length;
    let work = this.#work;
    if (work === undefined) {
      const marketDay = this.#month?.days.get(next.day);
      if (marketDay === undefined) {
        throw new Error(`CandleBackfill: day ${next.day} is not loaded`);
      }
      work = {
        kind: next.kind,
        day: next.day,
        next: 0,
        open: new Float64Array(count),
        close: new Float64Array(count),
        high: new Float64Array(count),
        low: new Float64Array(count),
        costMs: 0,
      };
      if (next.kind === 'open-close') {
        work.support = new SupportValues(tables, marketDay);
      } else {
        this.#curves.load(marketDay);
      }
      this.#work = work;
    }
    const series = work.next;
    if (work.kind === 'open-close') {
      const support = work.support as SupportValues;
      work.open[series] = support.value(series, 'open');
      work.close[series] = support.value(series, 'close');
    } else {
      const curve = this.#curves.seriesCurve(series);
      let max = curve[0];
      let min = curve[0];
      for (let j = 1; j < curve.length; j++) {
        max = Math.max(max, curve[j]);
        min = Math.min(min, curve[j]);
      }
      work.high[series] = max;
      work.low[series] = min;
    }
    work.next++;
    work.costMs += now() - started;
    if (work.next < count) {
      return;
    }
    this.#work = undefined;
    this.#seriesEstimate[work.kind] = nextEstimate(
      this.#seriesEstimate[work.kind],
      work.costMs / count,
    );
    const highLow = work.kind === 'high-low';
    emit(
      ids.map((seriesId, s) => ({
        seriesId,
        day: work.day,
        open: highLow ? Number.NaN : work.open[s],
        high: highLow ? work.high[s] : Number.NaN,
        low: highLow ? work.low[s] : Number.NaN,
        close: highLow ? Number.NaN : work.close[s],
      })),
    );
    if (removeDay(highLow ? this.#highLow : this.#openClose, work.day)) {
      this.#done++;
    }
  }
}
