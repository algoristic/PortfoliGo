import { dayStartTick, tickToDateTime, weekdayOfDay } from '@app/clock/domain/calendar-logic';
import { SATURDAY } from '@app/clock/domain/models/time.model';

/** Market days are weekdays; holidays follow in stage 2 (TS §3.3). */
export function isMarketDay(day: number): boolean {
  return weekdayOfDay(day) < SATURDAY;
}

export function isMonthStartDay(day: number): boolean {
  return tickToDateTime(dayStartTick(day)).day === 1;
}
