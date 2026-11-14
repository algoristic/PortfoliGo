import { monthlyAccountFee } from '@app/banking/domain/account-fee-logic';
import {
  BANK_RUN_TIME_OF_DAY,
  bankRunPlan,
  monthKey,
  monthOf,
} from '@app/banking/domain/bank-run-logic';
import { CalendarMonth } from '@app/banking/domain/models/household.model';
import { startOfDay } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { distributionAmount } from '@app/portfolio/domain/distribution-logic';
import { Cents } from '@app/shared/domain/models/money.model';

import {
  AnnouncedDividend,
  MAX_UPCOMING_DAYS,
  UPCOMING_KINDS,
  UpcomingEvent,
  UpcomingFeeAccount,
  UpcomingHousehold,
  UpcomingInputs,
  UpcomingKind,
} from './models/upcoming.model';

const KIND_RANK: Readonly<Record<UpcomingKind, number>> = Object.fromEntries(
  UPCOMING_KINDS.map((kind, rank) => [kind, rank]),
) as Record<UpcomingKind, number>;

/** Last tick of the window: `days` calendar days after `fromTick` (TS §8.1). */
export function upcomingEnd(fromTick: Tick, days: number): Tick {
  return fromTick + Math.min(Math.max(days, 0), MAX_UPCOMING_DAYS) * TICKS_PER_DAY;
}

/** Whether a date lies in the window: after `fromTick` (still to come) and not after `end`. */
export function isInWindow(tick: Tick, fromTick: Tick, end: Tick): boolean {
  return tick > fromTick && tick <= end;
}

/** By tick, then in the order of the kinds within a tick; equal ones keep their order. */
export function sortUpcoming(events: readonly UpcomingEvent[]): UpcomingEvent[] {
  return [...events].sort((a, b) => a.tick - b.tick || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

/**
 * Plannable dates of the next `days` days that only the worker knows (TS §8.1, E-05): the bank
 * runs with salary and living costs as base amounts, account and custody fees, announced ex-dates
 * of held instruments and the payouts of held or past ex-dates. Nothing that depends on future
 * prices; the state is not run ahead. Sorted like `sortUpcoming`.
 */
export function upcoming(fromTick: Tick, days: number, inputs: UpcomingInputs): UpcomingEvent[] {
  const end = upcomingEnd(fromTick, days);
  return sortUpcoming([
    ...bankRunEvents(fromTick, end, inputs.household),
    ...dividendEvents(fromTick, end, inputs),
  ]);
}

/**
 * The steps of the bank runs at 06:00 in `(fromTick, end]` (TS §7.4): the salary on the last bank
 * working day and the living costs on the first, both as base amounts; the account fee of the
 * settled month per open current account where it is not 0 (deposits so far plus a salary the
 * window still credits in that month); the custody fee of the past quarter without an amount,
 * since it follows the depot values.
 */
function bankRunEvents(fromTick: Tick, end: Tick, household: UpcomingHousehold): UpcomingEvent[] {
  const events: UpcomingEvent[] = [];
  const nowMonth = monthKey(monthOf(fromTick));
  let salaryThisMonth: Cents = 0;
  for (let run = startOfDay(fromTick) + BANK_RUN_TIME_OF_DAY; run <= end; run += TICKS_PER_DAY) {
    if (run <= fromTick) {
      continue;
    }
    const plan = bankRunPlan(run);
    for (const step of plan.steps) {
      switch (step) {
        case 'salary':
          if (household.netIncome > 0) {
            events.push({
              kind: 'salary',
              tick: run,
              amount: household.netIncome,
              accountId: household.salaryAccountId,
            });
            if (monthKey(plan.month) === nowMonth) {
              salaryThisMonth = household.netIncome;
            }
          }
          break;
        case 'living-costs':
          if (household.livingCosts > 0) {
            events.push({
              kind: 'living-costs',
              tick: run,
              amount: household.livingCosts,
              accountId: household.salaryAccountId,
            });
          }
          break;
        case 'account-fee':
          for (const account of household.currentAccounts) {
            const inWindow = account.accountId === household.salaryAccountId ? salaryThisMonth : 0;
            const fee = upcomingAccountFee(account, plan.settledMonth, nowMonth, inWindow);
            if (fee > 0) {
              events.push({
                kind: 'account-fee',
                tick: run,
                amount: fee,
                accountId: account.accountId,
              });
            }
          }
          break;
        case 'custody-fee':
          for (const depot of household.depots) {
            if (depot.custodyFee.kind !== 'none') {
              events.push({
                kind: 'custody-fee',
                tick: run,
                amount: null,
                accountId: depot.clearingAccountId,
                depotId: depot.depotId,
              });
            }
          }
          break;
        default:
          break;
      }
    }
  }
  return events;
}

/**
 * Fee of an open current account for the settled month (TS §7.4, `monthlyAccountFee`): waived when
 * the external deposits reach the threshold, else pro rata by the days the account is open. For
 * the running month the deposits so far plus `salaryInWindow`, for the month before the deposits
 * of last month.
 */
export function upcomingAccountFee(
  account: UpcomingFeeAccount,
  settled: CalendarMonth,
  nowMonth: string,
  salaryInWindow: Cents,
): Cents {
  const deposits =
    monthKey(settled) === nowMonth
      ? account.depositsThisMonth + salaryInWindow
      : account.depositsLastMonth;
  return monthlyAccountFee(
    account.conditions,
    { openedAt: account.openedAt, closedAt: null },
    settled,
    deposits,
  );
}

/**
 * Announced ex-dates (amount per share) and their payment dates, the payout for the shares held
 * now, and the payment dates of payouts earned at past ex-dates (TS §6.5, §7.4).
 */
function dividendEvents(fromTick: Tick, end: Tick, inputs: UpcomingInputs): UpcomingEvent[] {
  const events: UpcomingEvent[] = [];
  for (const dividend of inputs.announcedDividends) {
    if (isInWindow(dividend.exTick, fromTick, end)) {
      events.push({
        kind: 'ex-dividend',
        tick: dividend.exTick,
        amount: null,
        perShare: dividend.cents,
        depotId: dividend.depotId,
        instrumentId: dividend.instrumentId,
      });
    }
    pushPayment(events, fromTick, end, dividend);
  }
  for (const pending of inputs.pendingDistributions) {
    if (isInWindow(pending.paymentTick, fromTick, end)) {
      events.push({
        kind: 'dividend-payment',
        tick: pending.paymentTick,
        amount: pending.amount,
        accountId: pending.accountId,
        depotId: pending.depotId,
        instrumentId: pending.instrumentId,
      });
    }
  }
  return events;
}

function pushPayment(
  events: UpcomingEvent[],
  fromTick: Tick,
  end: Tick,
  dividend: AnnouncedDividend,
): void {
  const amount = distributionAmount(dividend.quantity, dividend.cents);
  if (amount > 0 && isInWindow(dividend.paymentTick, fromTick, end)) {
    events.push({
      kind: 'dividend-payment',
      tick: dividend.paymentTick,
      amount,
      depotId: dividend.depotId,
      instrumentId: dividend.instrumentId,
    });
  }
}
