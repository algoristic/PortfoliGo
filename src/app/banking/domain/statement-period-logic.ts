import { startOfMonth, startOfYear } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { StatementPeriod, StatementPeriodRange } from './models/statement.model';

/**
 * Tick bounds of a statement period at game time `now` (TS §7.2): calendar month and year of
 * `now` or the ones before, both bounds inclusive; the running period stays open to the end.
 */
export function statementPeriodRange(period: StatementPeriod, now: Tick): StatementPeriodRange {
  switch (period) {
    case 'all':
      return {};
    case 'this-month':
      return { from: startOfMonth(now) };
    case 'last-month': {
      const end = startOfMonth(now);
      return { from: startOfMonth(end - TICKS_PER_MINUTE), to: end - TICKS_PER_MINUTE };
    }
    case 'this-year':
      return { from: startOfYear(now) };
    case 'last-year': {
      const end = startOfYear(now);
      return { from: startOfYear(end - TICKS_PER_MINUTE), to: end - TICKS_PER_MINUTE };
    }
  }
}
