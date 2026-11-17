import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { detLog } from '@app/simulation/util/det-math';
import { uniformInt } from '@app/simulation/util/distributions';

import { RandomStream } from '@app/simulation/util/random-stream';

import { Company, DividendSchedule } from './models/company.model';
import { DIVIDENDS_PER_YEAR } from './models/taxonomy.model';

const MONTHS_PER_YEAR = 12;
const LAST_SCHEDULE_DAY = 28;

/**
 * Draws the yearly ex-date rhythm of every company in company order (TS §6.5) and, for companies
 * without a dividend at the epoch, the month in which they start to pay (E-33). Uses its own
 * stream, so the other company attributes do not move. Draw order per company: rhythm, then the
 * start month of a later payer.
 */
export function assignDividendSchedules(
  rng: RandomStream,
  companies: readonly Company[],
  initiationYears: number,
): Company[] {
  return companies.map((company) => {
    const schedule = drawDividendSchedule(rng, DIVIDENDS_PER_YEAR[company.dividend.frequency]);
    const startDay = company.dividend.yield > 0 ? 0 : drawStartDay(rng, initiationYears);
    return { ...company, dividend: { ...company.dividend, schedule, startDay } };
  });
}

/** First month in `1 … 12 / perYear` and a day in `1 … 28`; the date repeats every 12/perYear months. */
export function drawDividendSchedule(rng: RandomStream, perYear: number): DividendSchedule {
  const firstMonth = uniformInt(rng, 1, MONTHS_PER_YEAR / perYear);
  const day = uniformInt(rng, 1, LAST_SCHEDULE_DAY);
  return { firstMonth, day };
}

/**
 * First day of the month in which a company starts to pay: exponentially distributed with mean
 * `meanYears` after the epoch, rounded up to the first of a later month (7.1a-10), so a later
 * payer never starts at the epoch.
 */
export function drawStartDay(rng: RandomStream, meanYears: number): number {
  const epoch = tickToDateTime(dayStartTick(0));
  const months =
    epoch.month + Math.floor(-meanYears * detLog(1 - rng.nextFloat53()) * MONTHS_PER_YEAR);
  return dayIndex(
    dateTimeToTick({
      year: epoch.year + Math.floor(months / MONTHS_PER_YEAR),
      month: (months % MONTHS_PER_YEAR) + 1,
      day: 1,
    }),
  );
}
