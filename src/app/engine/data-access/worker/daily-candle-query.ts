import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { weeklyCandles } from '@app/market/domain/candle-logic';
import {
  candleBlockPlan,
  candleQueryEnd,
  hasOlderCandles,
  withHighLow,
} from '@app/market/domain/candle-window';
import { CandleBlock } from '@app/market/domain/chart-candles';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { Candle } from '@app/market/domain/models/candle.model';
import { PriceSource } from '@app/market/domain/price-source';

import { candleYear, decodeCandleValues } from './daily-candles.utils';
import { DailyCandleBucket, DailyCandlePatch } from './engine-host.model';

/** What the daily and weekly candle query needs (TS §8.2, §6.8). */
export interface DailyCandleQuery {
  series: number;
  seriesId: string;
  resolution: '1d' | '1w';
  from: number | null;
  to: number | undefined;
  limit: number;
  /** Current tick, the query limit. */
  now: number;
  prices: PriceSource;
  /** Year buckets of the series (`EngineStorage.loadDailyCandles`). */
  loadBuckets(fromYear: number, toYear: number): Promise<DailyCandleBucket[]>;
  /** Candles written or buffered but not yet stored, in write order. */
  pending: readonly DailyCandlePatch[];
  /** Open and close of past market days from the support points (`supportOpenClose`). */
  support(days: readonly number[]): Map<number, { open: number; close: number }>;
}

/**
 * Daily or weekly block of the candle query, never from minute curves except for the running day
 * (TS §6.8, §11.7): past days from the stored daily candles plus the not yet stored ones; days
 * without open or close (before the background job) from the support points, missing high and low
 * as the range of open and close. Stored days after the current tick never count (query limit).
 */
export async function dailyCandleBlock(query: DailyCandleQuery): Promise<CandleBlock> {
  const { series, seriesId, resolution, limit, now, prices } = query;
  const session = prices.session(series);
  const to = candleQueryEnd(query.to, now, session);
  const lastDay = dayIndex(to);
  const plan = candleBlockPlan(resolution, lastDay, limit, query.from, session);
  if (lastDay < plan.firstDay) {
    return { candles: [], hasOlder: hasOlderCandles(plan.searchedFrom, resolution, session) };
  }
  const today = dayIndex(now);
  const lastPast = Math.min(lastDay, today - 1);
  const days: number[] = [];
  for (let day = plan.firstDay; day <= lastPast; day++) {
    if (isMarketDay(day)) {
      days.push(day);
    }
  }
  const stored = new Map<number, Candle>();
  if (days.length > 0) {
    const buckets = await query.loadBuckets(candleYear(days[0]), candleYear(lastPast));
    for (const { year, values } of buckets) {
      for (const candle of decodeCandleValues(year, values)) {
        stored.set(dayIndex(candle.tick), candle);
      }
    }
    for (const patch of query.pending) {
      if (patch.seriesId === seriesId && patch.day >= days[0] && patch.day <= lastPast) {
        stored.set(patch.day, merged(stored.get(patch.day), patch));
      }
    }
  }
  const missing = days.filter((day) => {
    const candle = stored.get(day);
    return candle === undefined || Number.isNaN(candle.open) || Number.isNaN(candle.close);
  });
  const support = missing.length > 0 ? query.support(missing) : new Map();
  const daily = days.map((day) => {
    const candle = stored.get(day);
    const fallback = support.get(day);
    const tick = dayStartTick(day);
    if (fallback !== undefined) {
      return withHighLow({
        tick,
        open: fallback.open,
        high: candle?.high ?? Number.NaN,
        low: candle?.low ?? Number.NaN,
        close: fallback.close,
      });
    }
    return withHighLow({ ...(candle as Candle), tick });
  });
  if (lastDay === today && isMarketDay(today)) {
    // The running day from its minute curve (TS §6.8): one day, mostly cached.
    daily.push(...prices.candles(series, '1d', dayStartTick(today), dayStartTick(today), now));
  }
  const candles = (resolution === '1w' ? weeklyCandles(daily) : daily).slice(-limit);
  return {
    candles,
    hasOlder: hasOlderCandles(candles[0]?.tick ?? plan.searchedFrom, resolution, session),
  };
}

/** A patch over a stored candle: `NaN` fields keep the stored value (TS §6.8). */
function merged(candle: Candle | undefined, patch: DailyCandlePatch): Candle {
  const pick = (value: number, stored: number | undefined): number =>
    Number.isNaN(value) ? (stored ?? Number.NaN) : value;
  return {
    tick: dayStartTick(patch.day),
    open: pick(patch.open, candle?.open),
    high: pick(patch.high, candle?.high),
    low: pick(patch.low, candle?.low),
    close: pick(patch.close, candle?.close),
  };
}
