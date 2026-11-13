import {
  dateTimeToTick,
  dayIndex,
  daysInMonth,
  dayStartTick,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { Cents } from '@app/shared/domain/models/money.model';
import { centsToEuros } from '@app/shared/domain/money-logic';

import { isMarketDay } from './market-calendar';

/** Performance periods of the screener (TS §8.2, US-MK-02). */
export const PERFORMANCE_PERIODS = ['m1', 'm6', 'y1', 'y5'] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

/** Calendar months back per period. */
export const PERFORMANCE_MONTHS: Readonly<Record<PerformancePeriod, number>> = {
  m1: 1,
  m6: 6,
  y1: 12,
  y5: 60,
};

/** Market days of closes in a sparkline before the current price (about one month). */
export const SPARKLINE_CLOSES = 21;

const MONTHS_PER_YEAR = 12;

/**
 * The same date `months` calendar months before `day`, clamped to the end of a shorter month
 * (31.05. − 3 months = 28./29.02.).
 */
export function monthsBackDay(day: number, months: number): number {
  const { year, month, day: dayOfMonth } = tickToDateTime(dayStartTick(day));
  const total = year * MONTHS_PER_YEAR + (month - 1) - months;
  const targetYear = Math.floor(total / MONTHS_PER_YEAR);
  const targetMonth = total - targetYear * MONTHS_PER_YEAR + 1;
  const targetDay = Math.min(dayOfMonth, daysInMonth(targetYear, targetMonth));
  return dayIndex(dateTimeToTick({ year: targetYear, month: targetMonth, day: targetDay }));
}

/** The last market day on or before `day`. */
export function marketDayOnOrBefore(day: number): number {
  let result = day;
  while (!isMarketDay(result)) {
    result--;
  }
  return result;
}

/**
 * Market day whose close a performance over `months` refers to (TS §8.2): the last market day on or
 * before the same date `months` calendar months before `today`; `null` before the epoch (day 0).
 */
export function performanceReferenceDay(today: number, months: number): number | null {
  const day = marketDayOnOrBefore(monthsBackDay(today, months));
  return day < 0 ? null : day;
}

/**
 * The `count` market days that end with `lastDay` (a market day), oldest first, without days
 * before the epoch.
 */
export function marketDaysEndingAt(lastDay: number, count: number): number[] {
  const days: number[] = [];
  for (let day = lastDay; days.length < count && day >= 0; day--) {
    if (isMarketDay(day)) {
      days.push(day);
    }
  }
  return days.reverse();
}

/**
 * Market days whose ex-dates count for the trailing dividend yield on `today` (TS §8.2): after the
 * same date twelve months before, up to and including `today`, oldest first.
 */
export function trailingDividendDays(today: number): number[] {
  const days: number[] = [];
  for (let day = Math.max(monthsBackDay(today, MONTHS_PER_YEAR) + 1, 0); day <= today; day++) {
    if (isMarketDay(day)) {
      days.push(day);
    }
  }
  return days;
}

/** Relative change from `reference` to `last` (0.1 = +10 %). */
export function relativeChange(last: number, reference: number): number {
  return last / reference - 1;
}

/** Dividend yield of the dividends in cents per share at the price in euros. */
export function dividendYield(dividends: Cents, price: number): number {
  return centsToEuros(dividends) / price;
}
