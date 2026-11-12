import { uniformInt } from '@app/simulation/util/distributions';

import { RandomStream } from '@app/simulation/util/random-stream';

import { Company, DividendSchedule } from './models/company.model';
import { DIVIDENDS_PER_YEAR } from './models/taxonomy.model';

const MONTHS_PER_YEAR = 12;
const LAST_SCHEDULE_DAY = 28;

/**
 * Draws the yearly ex-date rhythm of every dividend payer in company order (TS §6.5). Uses its own
 * stream, so the other company attributes do not move.
 */
export function assignDividendSchedules(
  rng: RandomStream,
  companies: readonly Company[],
): Company[] {
  return companies.map((company) => {
    const { frequency } = company.dividend;
    if (frequency === null) {
      return company;
    }
    const schedule = drawDividendSchedule(rng, DIVIDENDS_PER_YEAR[frequency]);
    return { ...company, dividend: { ...company.dividend, schedule } };
  });
}

/** First month in `1 … 12 / perYear` and a day in `1 … 28`; the date repeats every 12/perYear months. */
export function drawDividendSchedule(rng: RandomStream, perYear: number): DividendSchedule {
  const firstMonth = uniformInt(rng, 1, MONTHS_PER_YEAR / perYear);
  const day = uniformInt(rng, 1, LAST_SCHEDULE_DAY);
  return { firstMonth, day };
}
