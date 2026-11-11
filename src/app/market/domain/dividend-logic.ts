import { isMarketDay } from './market-calendar';

import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  isBankWorkingDay,
  tickToDateTime,
} from '../../clock/domain/calendar-logic';
import { Cents } from '../../shared/domain/models/money.model';
import { eurosToCents } from '../../shared/domain/money-logic';
import { detLog } from '../../simulation/util/det-math';
import { DividendSchedule } from '../../world/domain/models/company.model';
import { DividendFrequency, DIVIDENDS_PER_YEAR } from '../../world/domain/models/taxonomy.model';

/** Market days between the announcement and the ex-date (TS §6.5). */
export const ANNOUNCEMENT_LEAD_DAYS = 20;
/** Bank working days between the ex-date and the payment date (TS §6.5). */
export const PAYMENT_LAG_DAYS = 2;

const MONTHS_PER_YEAR = 12;

/** First ex-date on or after `day`: the first market day on or after a scheduled date. */
export function exDayOnOrAfter(
  schedule: DividendSchedule,
  frequency: DividendFrequency,
  day: number,
): number {
  const step = MONTHS_PER_YEAR / DIVIDENDS_PER_YEAR[frequency];
  // A date in the previous year can still move into `day` when it falls on a weekend.
  let year = tickToDateTime(dayStartTick(day)).year - 1;
  for (;;) {
    for (let month = schedule.firstMonth; month <= MONTHS_PER_YEAR; month += step) {
      const exDay = nextMarketDay(dayIndex(dateTimeToTick({ year, month, day: schedule.day })));
      if (exDay >= day) {
        return exDay;
      }
    }
    year++;
  }
}

/** Day of the announcement, `ANNOUNCEMENT_LEAD_DAYS` market days before the ex-date. */
export function announcementDay(exDay: number): number {
  let day = exDay;
  for (let n = 0; n < ANNOUNCEMENT_LEAD_DAYS; n++) {
    day--;
    while (!isMarketDay(day)) {
      day--;
    }
  }
  return day;
}

/** Payment date: ex-date plus `PAYMENT_LAG_DAYS` bank working days. */
export function paymentDay(exDay: number): number {
  let day = exDay;
  for (let n = 0; n < PAYMENT_LAG_DAYS; n++) {
    day++;
    while (!isBankWorkingDay(dayStartTick(day))) {
      day++;
    }
  }
  return day;
}

/**
 * Dividend per share in cents: target yield × close before the announcement ÷ frequency
 * (TS §6.5). The prices of the announcement day itself never enter.
 */
export function dividendCents(
  targetYield: number,
  frequency: DividendFrequency,
  lastClose: number,
): Cents {
  return eurosToCents((targetYield * lastClose) / DIVIDENDS_PER_YEAR[frequency]);
}

/**
 * Log markdown of the ex-date at the open, `ln(P / (P − D))` with `P` = open before the markdown.
 * `P − D` never falls below the price floor, so a crashed share cannot reach a negative price.
 */
export function exMarkdown(openPrice: number, dividend: number, floor: number): number {
  return detLog(openPrice / Math.max(openPrice - dividend, floor));
}

function nextMarketDay(day: number): number {
  let result = day;
  while (!isMarketDay(result)) {
    result++;
  }
  return result;
}
