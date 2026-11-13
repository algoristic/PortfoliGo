import { dayIndex, dayStartTick, minuteOfDay } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { candleBlockPlan, candleQueryEnd, hasOlderCandles, isIntraday } from './candle-window';
import { CurveTables, SupportValues } from './day-curve';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { monthStartEntry, recomputeSupportDays } from './market-history';
import { Candle, CandleResolution, IntradayResolution } from './models/candle.model';
import { FactorHistory } from './models/market-state.model';
import { PriceSource } from './price-source';

/** A block of candles in ascending order and whether older ones exist (TS §8.2). */
export interface CandleBlock {
  candles: Candle[];
  hasOlder: boolean;
}

/**
 * The newest candle of a series that starts at or before `at`, with the values known at `now`
 * (`at ≤ now`): the running candle for `at = now`, a finished one for an earlier `at`. `null`
 * before the first candle. Computes only the days of that candle (a week at most), never the
 * history, so the chart subscription stays cheap at high speeds (TS §8.4).
 */
export function latestCandle(
  prices: PriceSource,
  series: number,
  resolution: CandleResolution,
  at: number,
  now: number,
): Candle | null {
  const { open } = prices.session(series);
  let day = dayIndex(at);
  if (minuteOfDay(at) < open) {
    day--;
  }
  while (day >= 0 && !isMarketDay(day)) {
    day--;
  }
  if (day < 0) {
    return null;
  }
  const dayStart = dayStartTick(day);
  const end = isIntraday(resolution) ? Math.min(at, dayStart + TICKS_PER_DAY - 1) : dayStart;
  return prices.candles(series, resolution, dayStart, end, now).at(-1) ?? null;
}

/**
 * Intraday block of the candle query (TS §8.2): the newest `limit` candles starting in
 * `[from, to]`, from the minute curves of at most `MAX_INTRADAY_DAYS` market days, cut at `now`.
 */
export function intradayCandleBlock(
  prices: PriceSource,
  series: number,
  resolution: IntradayResolution,
  range: { from: number | null; to: number | undefined; limit: number },
  now: number,
): CandleBlock {
  const session = prices.session(series);
  const to = candleQueryEnd(range.to, now, session);
  const plan = candleBlockPlan(resolution, dayIndex(to), range.limit, range.from, session);
  const candles =
    to < plan.searchedFrom
      ? []
      : prices.candles(series, resolution, plan.searchedFrom, to, now).slice(-range.limit);
  return {
    candles,
    hasOlder: hasOlderCandles(candles[0]?.tick ?? plan.searchedFrom, resolution, session),
  };
}

/**
 * Open and close of `series` on the given past market days from the support points (bit for bit
 * the ends of the minute curves), never from minute curves: one recomputation per month start,
 * stepping only the share itself (all shares for indices and ETFs).
 */
export function supportOpenClose(
  context: MarketContext,
  history: FactorHistory,
  tables: CurveTables,
  series: number,
  days: readonly number[],
): Map<number, { open: number; close: number }> {
  const result = new Map<number, { open: number; close: number }>();
  const sorted = [...new Set(days)].filter(isMarketDay).sort((a, b) => a - b);
  const stock = series < context.layout.instrumentIds.length ? series : undefined;
  let start = 0;
  while (start < sorted.length) {
    const monthStart = monthStartEntry(history, sorted[start]).day;
    let end = start + 1;
    while (end < sorted.length && monthStartEntry(history, sorted[end]).day === monthStart) {
      end++;
    }
    const group = new Set(sorted.slice(start, end));
    recomputeSupportDays(
      context,
      history,
      sorted[start],
      sorted[end - 1] + 1,
      (marketDay) => {
        if (group.has(marketDay.day)) {
          const support = new SupportValues(tables, marketDay);
          result.set(marketDay.day, {
            open: support.value(series, 'open'),
            close: support.value(series, 'close'),
          });
        }
      },
      stock,
    );
    start = end;
  }
  return result;
}
