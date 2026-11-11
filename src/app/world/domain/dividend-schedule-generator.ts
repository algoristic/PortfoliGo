import { Company } from './models/company.model';
import { DIVIDENDS_PER_YEAR } from './models/taxonomy.model';

import { uniformInt } from '../../simulation/util/distributions';
import { RandomStream } from '../../simulation/util/random-stream';

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
    const firstMonth = uniformInt(rng, 1, MONTHS_PER_YEAR / DIVIDENDS_PER_YEAR[frequency]);
    const day = uniformInt(rng, 1, LAST_SCHEDULE_DAY);
    return { ...company, dividend: { ...company.dividend, schedule: { firstMonth, day } } };
  });
}
