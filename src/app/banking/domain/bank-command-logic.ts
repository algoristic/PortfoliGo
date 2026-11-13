import { Cents } from '@app/shared/domain/models/money.model';

import { Account, AccountId, OpenableAccountKind } from './models/account.model';
import { BankCommandError, ClosingBlocker } from './models/bank-command.model';
import { BankConditions } from './models/bank-conditions.model';

/** Longest purpose of a transfer in characters, as in a SEPA transfer. */
export const MAX_PURPOSE_LENGTH = 140;

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: Cents;
  purpose: string;
}

export interface ClosingState {
  isSalaryAccount: boolean;
  /** Depot without positions, open orders and savings plans; always true for other accounts. */
  depotEmpty: boolean;
  /** Balance after the closing settlement. */
  remainder: Cents;
}

export function findAccount(accounts: readonly Account[], id: string): Account | undefined {
  return accounts.find((account) => account.id === id);
}

/** Characters of a purpose as the user sees them (code points, not UTF-16 units). */
export function purposeLength(purpose: string): number {
  return [...purpose].length;
}

/** Whether a bank offers the account kind (US-BK-02): every bank has depots, brokers nothing else. */
export function openAccountError(
  conditions: BankConditions | undefined,
  kind: OpenableAccountKind,
): BankCommandError | null {
  if (conditions === undefined) {
    return 'unknown-bank';
  }
  const offered =
    kind === 'depot' ||
    (kind === 'current' ? conditions.currentAccount : conditions.savingsAccount) !== null;
  return offered ? null : 'account-kind-not-offered';
}

/** An account a command acts on must exist and be open. */
export function openAccountIdError(
  accounts: readonly Account[],
  id: string,
): BankCommandError | null {
  const account = findAccount(accounts, id);
  if (account === undefined) {
    return 'unknown-account';
  }
  return account.closedAt === null ? null : 'account-closed';
}

/** Only an open current account can become the salary account (US-BK-05). */
export function salaryAccountError(
  accounts: readonly Account[],
  id: string,
): BankCommandError | null {
  const error = openAccountIdError(accounts, id);
  if (error !== null) {
    return error;
  }
  return (findAccount(accounts, id) as Account).kind === 'current' ? null : 'not-a-current-account';
}

/**
 * Checks an own transfer (TS §7.4, E-17, US-BK-04): between two different open accounts, a
 * positive whole number of cents up to the available amount of the source, with a purpose of at
 * most `MAX_PURPOSE_LENGTH` characters.
 */
export function transferError(
  accounts: readonly Account[],
  request: TransferRequest,
  available: (account: Account) => Cents,
): BankCommandError | null {
  const error =
    openAccountIdError(accounts, request.fromAccountId) ??
    openAccountIdError(accounts, request.toAccountId);
  if (error !== null) {
    return error;
  }
  if (request.fromAccountId === request.toAccountId) {
    return 'same-account';
  }
  if (!Number.isSafeInteger(request.amount) || request.amount < 1) {
    return 'invalid-amount';
  }
  if (purposeLength(request.purpose) > MAX_PURPOSE_LENGTH) {
    return 'purpose-too-long';
  }
  const from = findAccount(accounts, request.fromAccountId) as Account;
  return request.amount <= available(from) ? null : 'insufficient-funds';
}

/**
 * What keeps an account from closing (TS §7.4, US-BK-03): the salary account, a depot that is not
 * empty, and a negative balance after the settlement.
 */
export function closingBlockers(state: ClosingState): ClosingBlocker[] {
  const blockers: ClosingBlocker[] = [];
  if (state.isSalaryAccount) {
    blockers.push('salary-account');
  }
  if (!state.depotEmpty) {
    blockers.push('depot-not-empty');
  }
  if (state.remainder < 0) {
    blockers.push('negative-balance');
  }
  return blockers;
}

/**
 * The target of the remainder (TS §7.4): required when a balance remains; when given, it must be
 * another open account of the player.
 */
export function closingTargetError(
  accounts: readonly Account[],
  closingId: AccountId,
  targetAccountId: string | undefined,
  remainder: Cents,
): BankCommandError | null {
  if (targetAccountId === undefined) {
    return remainder > 0 ? 'target-required' : null;
  }
  const valid =
    targetAccountId !== closingId && openAccountIdError(accounts, targetAccountId) === null;
  return valid ? null : 'invalid-target';
}
