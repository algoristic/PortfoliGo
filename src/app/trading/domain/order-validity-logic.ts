import {
  dateTimeToTick,
  dayIndex,
  daysInMonth,
  dayStartTick,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import {
  CalendarDate,
  Tick,
  TICKS_PER_MINUTE,
  TradingHours,
} from '@app/clock/domain/models/time.model';
import { nextClose } from '@app/clock/domain/trading-hours-logic';

import { Order, OrderCommandError, OrderValidity } from './models/order.model';

/**
 * First tick at which an order placed (or changed) at `tick` no longer applies (TS §7.5):
 *
 * - `day`: the next close of the instrument's exchange after `tick`; during a session today's,
 *   outside it the one of the next trading day. At the closing minute itself the exchange is
 *   already closed, so that order runs until the next day's close.
 * - `date`: 00:00 of the day after the date. Sessions end before midnight, so this is the same as
 *   the close on that date, and it also holds for weekends and exchanges without a session that day.
 * - `gtc`: like `date` with the same date one year later (`latestValidityDate`).
 *
 * The caller checks the validity first (`validityError`).
 */
export function orderExpiry(validity: OrderValidity, tick: Tick, hours: TradingHours): Tick {
  switch (validity.kind) {
    case 'day':
      return nextClose(hours, tick + TICKS_PER_MINUTE);
    case 'date':
      return endOfDate(validity.date);
    case 'gtc':
      return endOfDate(latestValidityDate(tick));
  }
}

/** The order stops applying at its expiry; the engine expires it before checking the tick. */
export function isOrderExpired(order: Pick<Order, 'expiresAt'>, tick: Tick): boolean {
  return tick >= order.expiresAt;
}

/**
 * Last date an order placed at `tick` may be valid on: the same date one year later, with
 * 29 February moving to 28 February.
 */
export function latestValidityDate(tick: Tick): CalendarDate {
  const { year, month, day } = tickToDateTime(tick);
  return { year: year + 1, month, day: Math.min(day, daysInMonth(year + 1, month)) };
}

/** A validity date must be a calendar date from today up to `latestValidityDate`. */
export function validityError(validity: OrderValidity, tick: Tick): OrderCommandError | null {
  if (validity.kind !== 'date') {
    return null;
  }
  if (!isCalendarDate(validity.date) || endOfDate(validity.date) <= tick) {
    return 'invalid-validity';
  }
  return endOfDate(validity.date) > endOfDate(latestValidityDate(tick))
    ? 'validity-too-long'
    : null;
}

function endOfDate(date: CalendarDate): Tick {
  return dayStartTick(dayIndex(dateTimeToTick(date)) + 1);
}

function isCalendarDate({ year, month, day }: CalendarDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}
