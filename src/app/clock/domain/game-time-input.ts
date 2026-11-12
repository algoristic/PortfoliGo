import { dateTimeToTick, daysInMonth, tickToDateTime } from './calendar-logic';
import { HOURS_PER_DAY, MINUTES_PER_HOUR, Tick } from './models/time.model';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** Value of an `<input type="date">` for the day of a tick, e.g. `2030-04-01`. */
export function toDateInputValue(tick: Tick): string {
  const { year, month, day } = tickToDateTime(tick);
  return `${year}-${twoDigits(month)}-${twoDigits(day)}`;
}

/** Value of an `<input type="time">` for the time of a tick, e.g. `09:30`. */
export function toTimeInputValue(tick: Tick): string {
  const { hour, minute } = tickToDateTime(tick);
  return `${twoDigits(hour)}:${twoDigits(minute)}`;
}

/**
 * Tick of the values of a date and a time input (`2030-05-01`, `09:30`; an empty time is 00:00),
 * or `null` if they are no valid game date and time.
 */
export function parseDateTimeInput(date: string, time: string): Tick | null {
  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time === '' ? '00:00' : time);
  if (dateMatch === null || timeMatch === null) {
    return null;
  }
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const valid =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour < HOURS_PER_DAY &&
    minute < MINUTES_PER_HOUR;
  return valid ? dateTimeToTick({ year, month, day, hour, minute }) : null;
}
