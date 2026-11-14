import {
  monthKey,
  monthOf,
  nextMonth,
  previousMonth,
} from '@app/banking/domain/calendar-month-logic';
import { CalendarMonth } from '@app/banking/domain/models/household.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { Tick, TradingHours } from '@app/clock/domain/models/time.model';
import { nextOpen } from '@app/clock/domain/trading-hours-logic';

import { SavingsPlan } from './models/savings-plan.model';

type ScheduledPlan = Readonly<Pick<SavingsPlan, 'day' | 'paused' | 'handledUpTo'>>;

/**
 * Tick at which the savings plan of `month` executes (TS §7.8): the open of the instrument's
 * exchange on its day, or on the next trading day of that exchange. That may lie in the next month
 * (Saturday, 28 February → Monday, 2 March). Trading days are Monday to Friday; holidays follow in
 * stage 2 (TS §3.3).
 */
export function savingsPlanExecutionTick(
  day: number,
  month: CalendarMonth,
  hours: TradingHours,
): Tick {
  return nextOpen(hours, dateTimeToTick({ ...month, day }));
}

/**
 * The newest month whose execution lies before `from`, the first tick at which the plan may still
 * execute. A plan created, changed or resumed after tick T (commands act after their tick) is done
 * up to `savingsPlanHandledBefore(day, hours, T + 1)`: its first execution is the first one at or
 * after T + 1, missed ones are not made up.
 */
export function savingsPlanHandledBefore(day: number, hours: TradingHours, from: Tick): string {
  const month = monthOf(from);
  const previous = previousMonth(month);
  for (const candidate of [month, previous]) {
    if (savingsPlanExecutionTick(day, candidate, hours) < from) {
      return monthKey(candidate);
    }
  }
  // The previous month's execution moved past `from` (e.g. 1 March, 00:00 before the 2nd).
  return monthKey(previousMonth(previous));
}

/**
 * The month whose execution falls on `tick` and is not done yet, else `null`; `null` for a paused
 * plan. Only the month of `tick` and the one before can fall on it.
 */
export function savingsPlanDueMonth(
  plan: ScheduledPlan,
  hours: TradingHours,
  tick: Tick,
): CalendarMonth | null {
  if (plan.paused) {
    return null;
  }
  const month = monthOf(tick);
  for (const candidate of [previousMonth(month), month]) {
    if (
      monthKey(candidate) > plan.handledUpTo &&
      savingsPlanExecutionTick(plan.day, candidate, hours) === tick
    ) {
      return candidate;
    }
  }
  return null;
}

/**
 * The execution at or after `from` that comes next (TS §7.8), `null` for a paused plan. Months up to
 * `handledUpTo` are skipped, and so are months whose execution lies before `from`.
 */
export function savingsPlanNextExecution(
  plan: ScheduledPlan,
  hours: TradingHours,
  from: Tick,
): Tick | null {
  if (plan.paused) {
    return null;
  }
  let month = previousMonth(monthOf(from));
  for (;;) {
    const tick = savingsPlanExecutionTick(plan.day, month, hours);
    if (monthKey(month) > plan.handledUpTo && tick >= from) {
      return tick;
    }
    month = nextMonth(month);
  }
}

/**
 * The first execution of any of the plans at or after `from`, `null` when none is active: the tick
 * of the one scheduled task `savings-plan` (TS §3.8).
 */
export function nextSavingsPlanTick(
  plans: readonly Readonly<SavingsPlan>[],
  hoursOf: (plan: Readonly<SavingsPlan>) => TradingHours,
  from: Tick,
): Tick | null {
  let next: Tick | null = null;
  for (const plan of plans) {
    const tick = savingsPlanNextExecution(plan, hoursOf(plan), from);
    if (tick !== null && (next === null || tick < next)) {
      next = tick;
    }
  }
  return next;
}
