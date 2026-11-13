import { Cents } from '@app/shared/domain/models/money.model';

import { isPlayerAccount } from './ledger-logic';
import { AccountId } from './models/account.model';
import { AccountInflows } from './models/household.model';
import { TransactionDraft, TransactionType } from './models/ledger.model';

/** Only credits from outside count as deposits (TS §7.4): no own transfers, interest or refunds. */
const EXTERNAL_DEPOSIT_TYPES: readonly TransactionType[] = ['opening-balance', 'salary'];

/** Inflows of a newly opened current account. */
export function openInflows(accountId: AccountId): AccountInflows {
  return {
    accountId,
    salaryWindow: [0, 0, 0],
    salaryThisMonth: 0,
    depositsLastMonth: 0,
    depositsThisMonth: 0,
  };
}

/**
 * Inflows of the home bank's first current account at the game start: as if it had received the
 * net income in each of the three previous months, so that the home bank grants the full limit.
 */
export function startInflows(accountId: AccountId, netIncome: Cents): AccountInflows {
  return { ...openInflows(accountId), salaryWindow: [netIncome, netIncome, netIncome] };
}

/**
 * Adds the external deposits of a booked transaction to the inflows of its accounts. Every
 * account credited by a salary or the opening balance needs an entry.
 */
export function recordInflows(
  inflows: readonly AccountInflows[],
  transaction: Pick<TransactionDraft, 'type' | 'postings'>,
): AccountInflows[] {
  if (!EXTERNAL_DEPOSIT_TYPES.includes(transaction.type)) {
    return [...inflows];
  }
  const isSalary = transaction.type === 'salary';
  const result = [...inflows];
  for (const { account, amount } of transaction.postings) {
    if (!isPlayerAccount(account) || amount <= 0) {
      continue;
    }
    const index = result.findIndex((entry) => entry.accountId === account);
    if (index < 0) {
      throw new RangeError(`recordInflows: ${transaction.type} credits untracked ${account}`);
    }
    const entry = result[index];
    result[index] = {
      ...entry,
      depositsThisMonth: entry.depositsThisMonth + amount,
      salaryThisMonth: isSalary ? entry.salaryThisMonth + amount : entry.salaryThisMonth,
    };
  }
  return result;
}

/** Month end (TS §7.4): the current month becomes the newest month of the window. */
export function closeInflowMonth(inflows: readonly AccountInflows[]): AccountInflows[] {
  return inflows.map((entry) => ({
    accountId: entry.accountId,
    salaryWindow: [entry.salaryWindow[1], entry.salaryWindow[2], entry.salaryThisMonth],
    salaryThisMonth: 0,
    depositsLastMonth: entry.depositsThisMonth,
    depositsThisMonth: 0,
  }));
}

/** Salary of the account in the last three full months. */
export function windowSalary(entry: AccountInflows): Cents {
  return entry.salaryWindow[0] + entry.salaryWindow[1] + entry.salaryWindow[2];
}
