import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  isBankWorkingDay,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { Cents, CENTS_PER_EURO } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';
import { detLog } from '@app/simulation/util/det-math';
import { DividendSchedule } from '@app/world/domain/models/company.model';
import { DividendFrequency, DIVIDENDS_PER_YEAR } from '@app/world/domain/models/taxonomy.model';

import { isMarketDay } from './market-calendar';

/** Market days between the announcement and the ex-date (TS §6.5). */
export const ANNOUNCEMENT_LEAD_DAYS = 20;
/** Bank working days between the ex-date and the payment date (TS §6.5). */
export const PAYMENT_LAG_DAYS = 2;

const MONTHS_PER_YEAR = 12;
/** A dividend per share has four decimals in euros, two in cents (TS §6.5). */
const HUNDREDTHS_PER_CENT = 100;

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
 * Dividend per share in cents with two decimals, i.e. euros with four (TS §6.5, 7.1b-09): target
 * yield × close before the announcement ÷ frequency, rounded half away from zero to a hundredth of
 * a cent. The credit rounds to whole cents (`distributionAmount`). The prices of the announcement
 * day itself never enter.
 */
export function dividendCents(
  targetYield: number,
  frequency: DividendFrequency,
  lastClose: number,
): Cents {
  const euros = (targetYield * lastClose) / DIVIDENDS_PER_YEAR[frequency];
  return roundHalfAwayFromZero(euros * CENTS_PER_EURO * HUNDREDTHS_PER_CENT) / HUNDREDTHS_PER_CENT;
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
