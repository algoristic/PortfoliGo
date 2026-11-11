import {
  CalendarDate,
  DAYS_PER_WEEK,
  GameDateTime,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  SATURDAY,
  Tick,
  TICKS_PER_DAY,
  TICKS_PER_MINUTE,
  TimeOfDay,
  Weekday,
} from './models/time.model';

// Integer calendar arithmetic after Howard Hinnant's `days_from_civil`/`civil_from_days`
// (proleptic Gregorian calendar). No `Date`, no time zone: the game time zone has no DST
// (TS §3.1), and the results are identical in the UI and the worker.
const DAYS_PER_ERA = 146_097;
const UNIX_TO_CIVIL_ERA_OFFSET = 719_468;
const EPOCH: CalendarDate = { year: 2020, month: 1, day: 1 };
const EPOCH_UNIX_DAY = unixDayFromCivil(EPOCH);
/** 01.01.2020 was a Wednesday. */
const EPOCH_WEEKDAY: Weekday = 2;

export function dateTimeToTick(dateTime: CalendarDate & Partial<TimeOfDay>): Tick {
  const { year, month, day, hour = 0, minute = 0 } = dateTime;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour >= HOURS_PER_DAY ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute >= MINUTES_PER_HOUR
  ) {
    throw new RangeError(`dateTimeToTick: invalid date ${JSON.stringify(dateTime)}`);
  }
  const days = unixDayFromCivil({ year, month, day }) - EPOCH_UNIX_DAY;
  return days * TICKS_PER_DAY + (hour * MINUTES_PER_HOUR + minute) * TICKS_PER_MINUTE;
}

/** Monday, 01.04.2030, 00:00 (E-02). */
export const GAME_START_TICK: Tick = dateTimeToTick({ year: 2030, month: 4, day: 1 });

export function tickToDateTime(tick: Tick): GameDateTime {
  const minute = minuteOfDay(tick);
  return {
    ...civilFromUnixDay(dayIndex(tick) + EPOCH_UNIX_DAY),
    hour: Math.floor(minute / MINUTES_PER_HOUR),
    minute: minute % MINUTES_PER_HOUR,
  };
}

/** Days since the epoch. */
export function dayIndex(tick: Tick): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

export function dayStartTick(day: number): Tick {
  return day * TICKS_PER_DAY;
}

export function startOfDay(tick: Tick): Tick {
  return dayStartTick(dayIndex(tick));
}

/** Whole game minutes since 00:00 of the tick's day (0–1439). */
export function minuteOfDay(tick: Tick): number {
  return Math.floor((tick - startOfDay(tick)) / TICKS_PER_MINUTE);
}

export function weekday(tick: Tick): Weekday {
  return weekdayOfDay(dayIndex(tick));
}

export function weekdayOfDay(day: number): Weekday {
  return mod(day + EPOCH_WEEKDAY, DAYS_PER_WEEK) as Weekday;
}

export function isWeekend(tick: Tick): boolean {
  return weekday(tick) >= SATURDAY;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function startOfMonth(tick: Tick): Tick {
  const { year, month } = tickToDateTime(tick);
  return dateTimeToTick({ year, month, day: 1 });
}

export function startOfNextMonth(tick: Tick): Tick {
  const { year, month } = tickToDateTime(tick);
  return month === 12
    ? dateTimeToTick({ year: year + 1, month: 1, day: 1 })
    : dateTimeToTick({ year, month: month + 1, day: 1 });
}

export function startOfYear(tick: Tick): Tick {
  return dateTimeToTick({ year: tickToDateTime(tick).year, month: 1, day: 1 });
}

export function startOfNextYear(tick: Tick): Tick {
  return dateTimeToTick({ year: tickToDateTime(tick).year + 1, month: 1, day: 1 });
}

/** Monday to Friday; public holidays follow in stage 2 (TS §3.1). */
export function isBankWorkingDay(tick: Tick): boolean {
  return !isWeekend(tick);
}

/** 00:00 of the first bank working day of the month. */
export function firstBankWorkingDay(year: number, month: number): Tick {
  let tick = dateTimeToTick({ year, month, day: 1 });
  while (!isBankWorkingDay(tick)) {
    tick += TICKS_PER_DAY;
  }
  return tick;
}

/** 00:00 of the last bank working day of the month. */
export function lastBankWorkingDay(year: number, month: number): Tick {
  let tick = dateTimeToTick({ year, month, day: daysInMonth(year, month) });
  while (!isBankWorkingDay(tick)) {
    tick -= TICKS_PER_DAY;
  }
  return tick;
}

function unixDayFromCivil({ year, month, day }: CalendarDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - UNIX_TO_CIVIL_ERA_OFFSET;
}

function civilFromUnixDay(unixDay: number): CalendarDate {
  const z = unixDay + UNIX_TO_CIVIL_ERA_OFFSET;
  const era = Math.floor(z / DAYS_PER_ERA);
  const dayOfEra = z - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / (DAYS_PER_ERA - 1))) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
