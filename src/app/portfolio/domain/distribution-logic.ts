import { BANK_RUN_TIME_OF_DAY } from '@app/banking/domain/bank-run-logic';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { PendingDistribution } from './models/distribution.model';

/**
 * Gross payout of a holding (TS §7.4): shares times the amount per share, rounded to cents half
 * away from zero (fractional shares).
 */
export function distributionAmount(quantity: MicroUnits, cents: Cents): Cents {
  return roundHalfAwayFromZero((quantity * cents) / MICRO_UNITS_PER_UNIT);
}

/**
 * Tick of the credit (TS §3.8, §7.4): 06:00 of the payment date, with the bank run, so that the
 * credit comes before the bank's debits of that day.
 */
export function distributionPaymentTick(paymentDay: number): Tick {
  return dayStartTick(paymentDay) + BANK_RUN_TIME_OF_DAY;
}

/** Payouts still to be credited to an account (closing an account needs a target for them). */
export function pendingDistributionsFor(
  pending: readonly PendingDistribution[],
  accountId: string,
): Cents {
  let sum = 0;
  for (const distribution of pending) {
    if (distribution.accountId === accountId) {
      sum += distribution.amount;
    }
  }
  return sum;
}
