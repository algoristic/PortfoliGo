import { dailyCandle, intradayCandles, weeklyCandles } from './candle-logic';
import { createCurveTables, CurveTables, DayCurves } from './day-curve';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { recomputeSupportDays } from './market-history';
import { copyMarketDay } from './market-step';
import { Candle, CandleResolution } from './models/candle.model';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';
import { priceFromLog } from './price-logic';
import { seriesRef } from './series';

import { dayIndex, minuteOfDay, weekdayOfDay } from '../../clock/domain/calendar-logic';
import { Tick } from '../../clock/domain/models/time.model';

export const DEFAULT_CACHED_DAYS = 8;

export interface PriceSourceOptions {
  /** Number of trading days whose minute curves stay cached (least recently used first out). */
  cachedDays?: number;
}

/**
 * Price source of the engine (TS §6.1, §8.1): prices as a pure function of the support points and
 * the bridge streams. Support points of past days are recomputed from the month start states of
 * the history; the engine passes each freshly stepped day via `rememberDay`.
 *
 * Every query takes the current tick `now` and never returns values after it (TS §4.5, rule 7).
 * The caches are pure optimization: they are neither part of the snapshot nor of the checksum,
 * and the source never writes to the market state (rule 6).
 */
export class PriceSource {
  readonly tables: CurveTables;
  readonly #context: MarketContext;
  readonly #history: FactorHistory;
  readonly #state: Readonly<MarketState>;
  readonly #capacity: number;
  /** Cached days in the order of their last use (oldest first). */
  readonly #cache = new Map<number, DayCurves>();
  readonly #batch: DayCurves;

  constructor(
    context: MarketContext,
    history: FactorHistory,
    state: Readonly<MarketState>,
    options: PriceSourceOptions = {},
  ) {
    this.#context = context;
    this.#history = history;
    this.#state = state;
    this.#capacity = Math.max(1, options.cachedDays ?? DEFAULT_CACHED_DAYS);
    this.tables = createCurveTables(context);
    this.#batch = new DayCurves(this.tables);
  }

  /** Takes over the support points of a day that the engine has just stepped (copied). */
  rememberDay(day: Readonly<MarketDay>): void {
    this.#store(day.day, new DayCurves(this.tables).load(copyMarketDay(day)));
  }

  clearCaches(): void {
    this.#cache.clear();
  }

  /**
   * Value of a series (share or index, see `series.ts`) at `tick` (TS §6.1): the minute value
   * during the session, otherwise the official value – the close of the last trading day, or the
   * start value before the first one.
   */
  priceAt(series: number, tick: Tick, now: Tick): number {
    assertNotAfter(tick, now);
    const day = dayIndex(tick);
    const minute = minuteOfDay(tick);
    const { open, close } = this.#session(series);
    if (!isMarketDay(day) || minute < open) {
      return this.#lastClose(series, day - 1);
    }
    const curves = this.#dayCurves(day);
    if (minute >= close) {
      return curves.seriesClose(series);
    }
    return curves.seriesCurve(series)[minute - open];
  }

  /**
   * Minute values of a series on a trading day from its open; on the day of `now` only up to
   * `now`, before the open empty.
   */
  minuteCurve(series: number, day: number, now: Tick): Float64Array {
    if (!isMarketDay(day)) {
      return new Float64Array(0);
    }
    const lastIndex = this.#lastIndex(series, day, now);
    if (lastIndex < 0) {
      return new Float64Array(0);
    }
    return this.#dayCurves(day)
      .seriesCurve(series)
      .slice(0, lastIndex + 1);
  }

  /**
   * Candles of a series whose period starts in `[fromTick, toTick]` (intraday) or whose day lies
   * in that range (daily, weekly), cut at `now`; a running period is a partial candle.
   */
  candles(
    series: number,
    resolution: CandleResolution,
    fromTick: Tick,
    toTick: Tick,
    now: Tick,
  ): Candle[] {
    const to = Math.min(toTick, now);
    if (to < fromTick) {
      return [];
    }
    const { open } = this.#session(series);
    let fromDay = dayIndex(fromTick);
    const toDay = dayIndex(to);
    if (resolution === '1w') {
      fromDay -= weekdayOfDay(fromDay);
    }
    const candles: Candle[] = [];
    this.#forEachDay(series, fromDay, toDay + 1, (curves) => {
      const day = curves.day.day;
      const lastIndex = this.#lastIndex(series, day, now);
      if (lastIndex < 0) {
        return;
      }
      const curve = curves.seriesCurve(series);
      if (resolution === '1d' || resolution === '1w') {
        candles.push(dailyCandle(curve, day, lastIndex));
        return;
      }
      for (const candle of intradayCandles(curve, day, open, resolution, lastIndex)) {
        if (candle.tick >= fromTick && candle.tick <= to) {
          candles.push(candle);
        }
      }
    });
    return resolution === '1w' ? weeklyCandles(candles) : candles;
  }

  #session(series: number): { open: number; close: number } {
    const { layout, indices } = this.#context;
    const { kind, index } = seriesRef(this.#context, series);
    const source = kind === 'stock' ? layout : indices;
    return {
      open: layout.boundaries[source.openBoundary[index]],
      close: layout.boundaries[source.closeBoundary[index]],
    };
  }

  /** Last index of the minute curve that is known at `now`; −1 before the open. */
  #lastIndex(series: number, day: number, now: Tick): number {
    const { open, close } = this.#session(series);
    const nowDay = dayIndex(now);
    if (day > nowDay) {
      throw new RangeError(`PriceSource: day ${day} is after the current tick ${now}`);
    }
    if (day < nowDay) {
      return close - open;
    }
    return Math.min(minuteOfDay(now), close) - open;
  }

  #lastClose(series: number, fromDay: number): number {
    for (let day = fromDay; day >= 0; day--) {
      if (isMarketDay(day)) {
        return this.#dayCurves(day).seriesClose(series);
      }
    }
    return this.#startValue(series);
  }

  /** Value before the first trading day: start price, or the index level from the start prices. */
  #startValue(series: number): number {
    const { layout, indices, config } = this.#context;
    const { kind, index } = seriesRef(this.#context, series);
    if (kind === 'stock') {
      return priceFromLog(layout.logBase[index], config.priceFloor);
    }
    let sum = 0;
    for (let n = indices.memberStart[index]; n < indices.memberStart[index + 1]; n++) {
      sum +=
        indices.shares[n] * priceFromLog(layout.logBase[indices.members[n]], config.priceFloor);
    }
    return sum / indices.divisor[index];
  }

  #dayCurves(day: number): DayCurves {
    this.#assertStepped(day);
    const cached = this.#cache.get(day);
    if (cached !== undefined) {
      this.#cache.delete(day);
      this.#cache.set(day, cached);
      return cached;
    }
    let curves: DayCurves | undefined;
    recomputeSupportDays(this.#context, this.#history, day, day + 1, (recomputed) => {
      curves = new DayCurves(this.tables).load(copyMarketDay(recomputed));
    });
    if (curves === undefined) {
      throw new RangeError(`PriceSource: day ${day} is not a market day`);
    }
    this.#store(day, curves);
    return curves;
  }

  /**
   * Calls `onDay` for every market day in `[fromDay, toDay)` in ascending order. Uses the cache
   * when it holds all days, otherwise one forward pass that steps only this share (all shares for
   * an index). The passed curves are only valid during the call.
   */
  #forEachDay(
    series: number,
    fromDay: number,
    toDay: number,
    onDay: (curves: DayCurves) => void,
  ): void {
    const start = Math.max(0, fromDay);
    if (toDay <= start) {
      return;
    }
    this.#assertStepped(toDay - 1);
    let cachedAll = true;
    for (let day = start; day < toDay && cachedAll; day++) {
      cachedAll = !isMarketDay(day) || this.#cache.has(day);
    }
    if (cachedAll) {
      for (let day = start; day < toDay; day++) {
        if (isMarketDay(day)) {
          onDay(this.#dayCurves(day));
        }
      }
      return;
    }
    recomputeSupportDays(
      this.#context,
      this.#history,
      start,
      toDay,
      (day) => onDay(this.#batch.load(day)),
      this.#context.layout.instrumentIds.length > series ? series : undefined,
    );
  }

  #assertStepped(day: number): void {
    if (day >= this.#state.day) {
      throw new RangeError(`PriceSource: day ${day} has not been stepped yet`);
    }
  }

  #store(day: number, curves: DayCurves): void {
    this.#cache.delete(day);
    this.#cache.set(day, curves);
    while (this.#cache.size > this.#capacity) {
      const oldest = this.#cache.keys().next().value as number;
      this.#cache.delete(oldest);
    }
  }
}

function assertNotAfter(tick: Tick, now: Tick): void {
  if (tick > now) {
    throw new RangeError(`PriceSource: tick ${tick} is after the current tick ${now}`);
  }
}
