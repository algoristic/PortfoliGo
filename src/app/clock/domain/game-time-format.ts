import { perLocale } from '@app/shared/util/locale';

import { tickToDateTime } from './calendar-logic';
import { Tick } from './models/time.model';

// The game time zone is formatted as UTC, so the browser's time zone never shifts the result. The
// locale follows the language (TS §11.9); the examples are German, English in parentheses.
const dateTimeFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
);
const weekdayTimeFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
);
const dateFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
);

/** Weekday, date and time of a tick, e.g. `Mo., 01.04.2030, 09:30` (`Mon, 01/04/2030, 09:30`). */
export function formatGameTime(tick: Tick): string {
  return dateTimeFormat().format(utcMs(tick));
}

/** Weekday and time of a tick, e.g. `Mo., 09:30` (`Mon 09:30`); for times within the next days. */
export function formatGameWeekdayTime(tick: Tick): string {
  return weekdayTimeFormat().format(utcMs(tick));
}

/** Date of a tick, e.g. `01.04.2030` (`01/04/2030`). */
export function formatGameDate(tick: Tick): string {
  return dateFormat().format(utcMs(tick));
}

function utcMs(tick: Tick): number {
  const { year, month, day, hour, minute } = tickToDateTime(tick);
  return Date.UTC(year, month - 1, day, hour, minute);
}
