import { Cents, CENTS_PER_EURO } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { windowSalary } from './inflow-logic';
import { Account, AccountId, CurrentAccount } from './models/account.model';
import {
  AccountEventCode,
  AccountInflows,
  CoverageState,
  OverdraftLimit,
} from './models/household.model';

/** The limit follows the average salary of the last three full calendar months (TS §7.4). */
export const SALARY_WINDOW_MONTHS = 3;

/**
 * Overdraft limits of all open current accounts in account order (TS §7.4, E-17). A bank grants
 * `limitIncomeFactor` × the average monthly salary its current accounts received in the window
 * (closed accounts included), rounded to cents and then down to whole euros. The limit sits on its
 * open current account with the most salary in the window; ties go to the salary account, then to
 * the smaller account number. All other current accounts get 0.
 */
export function overdraftLimits(
  accounts: readonly Account[],
  inflows: readonly AccountInflows[],
  salaryAccountId: AccountId,
  limitIncomeFactor: (bankId: string) => number,
): OverdraftLimit[] {
  const salaryOf = new Map(inflows.map((entry) => [entry.accountId, windowSalary(entry)]));
  const salary = (account: Account): Cents => salaryOf.get(account.id) ?? 0;
  const currentAccounts = accounts.filter(
    (account): account is CurrentAccount => account.kind === 'current',
  );
  const open = currentAccounts.filter((account) => account.closedAt === null);
  const carriers = new Map<string, CurrentAccount>();
  for (const account of open) {
    const carrier = carriers.get(account.bankId);
    if (carrier === undefined || carriesBefore(account, carrier, salary, salaryAccountId)) {
      carriers.set(account.bankId, account);
    }
  }
  return open.map((account) => {
    if (carriers.get(account.bankId) !== account) {
      return { accountId: account.id, limit: 0 };
    }
    let bankSalary = 0;
    for (const other of currentAccounts) {
      if (other.bankId === account.bankId) {
        bankSalary += salary(other);
      }
    }
    return {
      accountId: account.id,
      limit: bankLimit(bankSalary, limitIncomeFactor(account.bankId)),
    };
  });
}

/** Amount for own transfers (TS §7.4): balance plus free limit, never negative. */
export function availableAmount({ balance, limit }: CoverageState): Cents {
  return Math.max(0, balance + (limit ?? 0));
}

/**
 * Available amount for transfers, standing orders and savings plans (TS §7.4, §7.5): the available
 * amount minus the reservations of the active buy orders of a clearing account; never negative.
 */
export function availableAfterReservations(state: CoverageState, reserved: Cents): Cents {
  return Math.max(0, availableAmount(state) - reserved);
}

/**
 * Events of a change of balance or limit (TS §7.4): `account-uncovered` when the balance turns
 * negative, `overdraft-limit-exceeded` when it falls below −limit (current accounts only), each
 * only if it did not hold before.
 */
export function accountEvents(before: CoverageState, after: CoverageState): AccountEventCode[] {
  const events: AccountEventCode[] = [];
  if (before.balance >= 0 && after.balance < 0) {
    events.push('account-uncovered');
  }
  if (after.limit !== null && after.balance < -after.limit && !beyondLimit(before)) {
    events.push('overdraft-limit-exceeded');
  }
  return events;
}

function beyondLimit({ balance, limit }: CoverageState): boolean {
  return limit !== null && balance < -limit;
}

function carriesBefore(
  account: CurrentAccount,
  carrier: CurrentAccount,
  salary: (account: Account) => Cents,
  salaryAccountId: AccountId,
): boolean {
  if (salary(account) !== salary(carrier)) {
    return salary(account) > salary(carrier);
  }
  if ((account.id === salaryAccountId) !== (carrier.id === salaryAccountId)) {
    return account.id === salaryAccountId;
  }
  return account.number < carrier.number;
}

function bankLimit(windowSalary: Cents, factor: number): Cents {
  const cents = roundHalfAwayFromZero((factor * windowSalary) / SALARY_WINDOW_MONTHS);
  return Math.max(0, cents - (cents % CENTS_PER_EURO));
}
