import { dateTimeToTick, isBankWorkingDay, startOfDay } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { MAX_PURPOSE_LENGTH, openAccountIdError, purposeLength } from './bank-command-logic';
import {
  BANK_RUN_TIME_OF_DAY,
  monthKey,
  monthOf,
  nextMonth,
  previousMonth,
} from './calendar-month-logic';
import { Account } from './models/account.model';
import { BankCommandError } from './models/bank-command.model';
import { CalendarMonth } from './models/household.model';
import {
  STANDING_ORDER_FIRST_DAY,
  STANDING_ORDER_LAST_DAY,
  StandingOrder,
  StandingOrderId,
  StandingOrderSpec,
} from './models/standing-order.model';

/** `so-<n>` from the player's counter of standing orders. */
export function standingOrderId(sequence: number): StandingOrderId {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`standing order sequence must be a positive integer: ${sequence}`);
  }
  return `so-${sequence}`;
}

/** Number of a standing order ID, for the order of creation (`so-10` after `so-9`). */
export function standingOrderSequence(id: StandingOrderId): number {
  return Number(id.slice(3));
}

/**
 * Checks a standing order (TS §7.4, US-BK-10): two different open accounts of the player, an amount
 * of whole cents ≥ 1, a day from 1 to 28 and a purpose of at most `MAX_PURPOSE_LENGTH` characters.
 * Funds are not checked here: they count on the execution day.
 */
export function standingOrderError(
  accounts: readonly Account[],
  spec: StandingOrderSpec,
): BankCommandError | null {
  const error =
    openAccountIdError(accounts, spec.fromAccountId) ??
    openAccountIdError(accounts, spec.toAccountId);
  if (error !== null) {
    return error;
  }
  if (spec.fromAccountId === spec.toAccountId) {
    return 'same-account';
  }
  if (!Number.isSafeInteger(spec.amount) || spec.amount < 1) {
    return 'invalid-amount';
  }
  if (
    !Number.isInteger(spec.day) ||
    spec.day < STANDING_ORDER_FIRST_DAY ||
    spec.day > STANDING_ORDER_LAST_DAY
  ) {
    return 'invalid-day';
  }
  return purposeLength(spec.purpose) > MAX_PURPOSE_LENGTH ? 'purpose-too-long' : null;
}

/**
 * 00:00 of the day the standing order of `month` executes: its day in the month, or the next bank
 * working day after it (TS §7.4). That may lie in the next month (Saturday, 28 February → Monday,
 * 2 March).
 */
export function executionDay(day: number, month: CalendarMonth): Tick {
  let tick = dateTimeToTick({ ...month, day });
  while (!isBankWorkingDay(tick)) {
    tick += TICKS_PER_DAY;
  }
  return tick;
}

/**
 * The newest month whose execution day (`day` of the month, before moving to a bank working day)
 * lies before the day of `tick`. A standing order created, changed or resumed at `tick` is done up
 * to this month: its first execution is the first execution day on or after that day.
 */
export function handledBefore(day: number, tick: Tick): string {
  const month = monthOf(tick);
  const passed = dateTimeToTick({ ...month, day }) < startOfDay(tick);
  return monthKey(passed ? month : previousMonth(month));
}

/** The later of two month keys (`JJJJ-MM` compare as strings). */
export function laterMonth(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * The month whose execution falls on the day of `tick` and is not done yet, else `null`; `null`
 * for a paused order. Only the month of `tick` and the one before can fall on it.
 */
export function dueMonth(
  order: Readonly<Pick<StandingOrder, 'day' | 'paused' | 'handledUpTo'>>,
  tick: Tick,
): CalendarMonth | null {
  if (order.paused) {
    return null;
  }
  const day = startOfDay(tick);
  const month = monthOf(tick);
  for (const candidate of [previousMonth(month), month]) {
    if (monthKey(candidate) > order.handledUpTo && executionDay(order.day, candidate) === day) {
      return candidate;
    }
  }
  return null;
}

/**
 * The bank run (06:00) at or after `tick` that executes the standing order next (TS §7.4), `null`
 * for a paused order. Months up to `handledUpTo` are skipped, and so are months whose execution
 * lies before `tick`.
 */
export function nextExecution(
  order: Readonly<Pick<StandingOrder, 'day' | 'paused' | 'handledUpTo'>>,
  tick: Tick,
): Tick | null {
  if (order.paused) {
    return null;
  }
  let month = previousMonth(monthOf(tick));
  for (;;) {
    const run = executionDay(order.day, month) + BANK_RUN_TIME_OF_DAY;
    if (monthKey(month) > order.handledUpTo && run >= tick) {
      return run;
    }
    month = nextMonth(month);
  }
}

/**
 * Whether the execution goes through (TS §7.4): the whole amount up to the available amount of the
 * source (for clearing accounts after the reservations of open buy orders); there are no partial
 * transfers.
 */
export function canExecute(amount: Cents, available: Cents): boolean {
  return amount <= available;
}
