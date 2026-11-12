import {
  annualizedVolatility,
  geometricReturn,
  logReturns,
  quantile,
} from '@app/analysis/domain/statistics-logic';
import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { isMarketDay } from '@app/market/domain/market-calendar';

import { RollingWindows, WindowRange } from './models/lab-statistics.model';

/** Game years after the game start at which the long-term measures are taken (TS §6.9, E-22). */
export const CHECKPOINT_YEARS = [0, 10, 25, 50, 100] as const;
/** Lengths of the rolling windows in years (TS §6.9). */
export const WINDOW_YEARS = [10, 30] as const;

/** Day index of the same calendar date `years` after `day` (29 February becomes 1 March). */
export function sameDateLater(day: number, years: number): number {
  const { year, month, day: dayOfMonth } = tickToDateTime(dayStartTick(day));
  const monthStart = dayIndex(dateTimeToTick({ year: year + years, month, day: 1 }));
  return monthStart + dayOfMonth - 1;
}

/**
 * Last market day before game start + `years`: its close is the state of the market at that date
 * (for 0 years, the market at the game start).
 */
export function checkpointDay(years: number): number {
  let day = sameDateLater(dayIndex(GAME_START_TICK), years) - 1;
  while (!isMarketDay(day)) {
    day--;
  }
  return day;
}

/**
 * The world index in windows of `years` (`years · marketDaysPerYear` daily returns), shifted by
 * one year: geometric return of the total return index, volatility of the price index and the
 * dividend yield as the growth of `ln(TR / price)`. Windows that don't fit are left out.
 */
export function rollingWindows(
  worldPrice: ArrayLike<number>,
  worldTotalReturn: ArrayLike<number>,
  years: number,
  marketDaysPerYear: number,
): RollingWindows {
  const length = years * marketDaysPerYear;
  const returns: number[] = [];
  const volatilities: number[] = [];
  const yields: number[] = [];
  for (let start = 0; start + length < worldPrice.length; start += marketDaysPerYear) {
    const end = start + length;
    const price = Array.prototype.slice.call(worldPrice, start, end + 1) as number[];
    returns.push(geometricReturn(worldTotalReturn[start], worldTotalReturn[end], years));
    volatilities.push(annualizedVolatility(logReturns(price), marketDaysPerYear));
    yields.push(
      (Math.log(worldTotalReturn[end] / worldTotalReturn[start]) -
        Math.log(worldPrice[end] / worldPrice[start])) /
        years,
    );
  }
  return {
    years,
    count: returns.length,
    totalReturn: range(returns),
    volatility: range(volatilities),
    dividendYield: range(yields),
  };
}

function range(values: number[]): WindowRange {
  if (values.length === 0) {
    return { min: Number.NaN, median: Number.NaN, max: Number.NaN };
  }
  const sorted = Float64Array.from(values).sort();
  return { min: sorted[0], median: quantile(sorted, 0.5), max: sorted[sorted.length - 1] };
}
