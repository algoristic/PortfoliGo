import { dayIndex, dayStartTick, isWeekend, minuteOfDay, weekdayOfDay } from './calendar-logic';
import { DAYS_PER_WEEK, SATURDAY, Tick, TICKS_PER_MINUTE, TradingHours } from './models/time.model';

/** Open from `open` (inclusive) to `close` (exclusive) on weekdays (TS §3.3, E-18). */
export function isTradingTime(hours: TradingHours, tick: Tick): boolean {
  if (isWeekend(tick)) {
    return false;
  }
  const minute = minuteOfDay(tick);
  return minute >= hours.open && minute < hours.close;
}

/** First opening at or after `tick`; during a session, that is the opening of the next session. */
export function nextOpen(hours: TradingHours, tick: Tick): Tick {
  return nextSessionBoundary(hours.open, tick);
}

/** First closing at or after `tick`; while closed, that is the end of the next session. */
export function nextClose(hours: TradingHours, tick: Tick): Tick {
  return nextSessionBoundary(hours.close, tick);
}

function nextSessionBoundary(minute: number, tick: Tick): Tick {
  // A week always contains a weekday, so at most one week plus one day has to be searched.
  for (let day = dayIndex(tick); day <= dayIndex(tick) + DAYS_PER_WEEK; day++) {
    const boundary = dayStartTick(day) + minute * TICKS_PER_MINUTE;
    if (weekdayOfDay(day) < SATURDAY && boundary >= tick) {
      return boundary;
    }
  }
  throw new Error('nextSessionBoundary: no weekday found');
}
