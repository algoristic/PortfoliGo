import {
  dateTimeToTick,
  daysInMonth,
  startOfNextMonth,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_MINUTE, TradingHours } from '@app/clock/domain/models/time.model';
import { nextOpen } from '@app/clock/domain/trading-hours-logic';

import { JumpTarget } from './models/jump-target.model';

/**
 * Latest tick a jump may reach from `now` (PS US-ZT-05): the same minute one calendar year later;
 * from 29 February the 28th.
 */
export function maxJumpTick(now: Tick): Tick {
  const { year, month, day, hour, minute } = tickToDateTime(now);
  return dateTimeToTick({
    year: year + 1,
    month,
    day: Math.min(day, daysInMonth(year + 1, month)),
    hour,
    minute,
  });
}

/**
 * Tick a jump from `now` ends at (TS §3.7), or `null` if the target is invalid: the next opening of
 * any of the `sessions` after now, the start of the next month, or a given minute after now and at
 * most one calendar year ahead.
 */
export function jumpTargetTick(
  target: JumpTarget,
  now: Tick,
  sessions: readonly TradingHours[],
): Tick | null {
  switch (target.kind) {
    case 'next-open': {
      if (sessions.length === 0) {
        return null;
      }
      return Math.min(...sessions.map((hours) => nextOpen(hours, now + TICKS_PER_MINUTE)));
    }
    case 'next-month':
      return startOfNextMonth(now);
    case 'date':
      return Number.isSafeInteger(target.tick) &&
        target.tick > now &&
        target.tick <= maxJumpTick(now)
        ? target.tick
        : null;
  }
}
