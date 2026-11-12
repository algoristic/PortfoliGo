import { dayStartTick, tickToDateTime, weekdayOfDay } from '@app/clock/domain/calendar-logic';
import { SATURDAY } from '@app/clock/domain/models/time.model';

/** Market days are weekdays; holidays follow in stage 2 (TS §3.3). */
export function isMarketDay(day: number): boolean {
  return weekdayOfDay(day) < SATURDAY;
}

export function isMonthStartDay(day: number): boolean {
  return tickToDateTime(dayStartTick(day)).day === 1;
}

/** Number of market days before `day` since the epoch (day 0), i.e. day steps already taken. */
export function marketDaysBefore(day: number): number {
  const weeks = Math.floor(day / 7);
  let count = weeks * 5;
  for (let d = weeks * 7; d < day; d++) {
    if (isMarketDay(d)) {
      count++;
    }
  }
  return count;
}
