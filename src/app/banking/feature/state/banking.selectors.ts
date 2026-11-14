import { getRouterSelectors } from '@ngrx/router-store';
import { createFeatureSelector, createSelector } from '@ngrx/store';

import { sortBanks } from '@app/banking/domain/bank-comparison-logic';
import { ACCOUNT_KINDS, AccountId } from '@app/banking/domain/models/account.model';
import { isEngineCommandError } from '@app/engine/feature/state/session.utils';
import { Bank } from '@app/world/domain/models/bank.model';

import {
  AccountEntry,
  AccountOverview,
  AccountTotals,
  BankCommand,
  BankComparison,
  MonthlyOverviewRow,
  StandingOrderEntry,
  StatementWindow,
} from './banking.model';
import { accountsAdapter, BANKING_FEATURE_KEY, BankingState } from './banking.reducer';
import { isStatementFilterActive } from './banking.utils';

const selectState = createFeatureSelector<BankingState>(BANKING_FEATURE_KEY);
const { selectAll } = accountsAdapter.getSelectors();

/** All accounts of the player, closed ones included, in account order. */
export const selectAccountViews = createSelector(selectState, selectAll);
export const selectBanks = createSelector(selectState, (state) => state.banks);
export const selectNetWorth = createSelector(selectState, (state) => state.netWorth);
export const selectPending = createSelector(selectState, (state) => state.pending);

export const selectBankSort = createSelector(selectState, (state) => state.bankSort);
export const selectMonthlyValues = createSelector(selectState, (state) => state.monthlyValues);
export const selectStandingOrderViews = createSelector(
  selectState,
  (state) => state.standingOrders,
);

export const selectIsPending = (command: BankCommand) =>
  createSelector(selectPending, (pending) => pending[command] > 0);

/** All accounts with their bank, closed ones included (T7 decides what the overview shows). */
export const selectAccounts = createSelector(
  selectAccountViews,
  selectBanks,
  (accounts, banks): AccountEntry[] => {
    const banksById = new Map<string, Bank>((banks ?? []).map((bank) => [bank.id, bank]));
    return accounts.map((account) => ({ ...account, bank: banksById.get(account.bankId) ?? null }));
  },
);

export const selectOpenAccounts = createSelector(selectAccounts, (accounts) =>
  accounts.filter((account) => account.closedAt === null),
);

export const selectAccount = (accountId: AccountId) =>
  createSelector(
    selectAccounts,
    (accounts) => accounts.find((account) => account.id === accountId) ?? null,
  );

/** Balances of the open accounts per kind and in total (account overview, TS §7.9). */
export const selectAccountTotals = createSelector(selectOpenAccounts, (accounts): AccountTotals => {
  const byKind = { current: 0, savings: 0, clearing: 0 };
  for (const account of accounts) {
    byKind[account.kind] += account.balance;
  }
  return { byKind, total: byKind.current + byKind.savings + byKind.clearing };
});

/** The open salary account; `null` before the first projection. */
export const selectSalaryAccount = createSelector(
  selectOpenAccounts,
  (accounts) => accounts.find((account) => account.salaryAccount) ?? null,
);

/** Accounts a transfer or a closing remainder from `sourceId` can go to: open, not the source. */
export const selectTargetAccounts = (sourceId: AccountId) =>
  createSelector(selectOpenAccounts, (accounts) =>
    accounts.filter((account) => account.id !== sourceId),
  );

/** The player's open accounts at a bank (bank comparison, closing a bank's accounts). */
export const selectAccountsOfBank = (bankId: string) =>
  createSelector(selectOpenAccounts, (accounts) =>
    accounts.filter((account) => account.bankId === bankId),
  );

/**
 * Open accounts for the overview (AP 3.4): the salary account first, then by bank name, kind
 * (current, savings, clearing) and number; closed accounts apart, the last closed first.
 */
export const selectAccountOverview = createSelector(selectAccounts, (accounts): AccountOverview => {
  const open = accounts.filter((account) => account.closedAt === null).sort(compareOpenAccounts);
  const closed = accounts
    .filter((account) => account.closedAt !== null)
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0) || a.number.localeCompare(b.number));
  return { open, closed };
});

function compareOpenAccounts(a: AccountEntry, b: AccountEntry): number {
  return (
    Number(b.salaryAccount) - Number(a.salaryAccount) ||
    bankName(a).localeCompare(bankName(b), 'de') ||
    ACCOUNT_KINDS.indexOf(a.kind) - ACCOUNT_KINDS.indexOf(b.kind) ||
    a.number.localeCompare(b.number)
  );
}

function bankName(account: AccountEntry): string {
  return account.bank?.name ?? account.bankId;
}

/** The banks of the comparison (US-BK-01): sorted by the chosen feature, else in world order. */
export const selectBankComparison = createSelector(
  selectBanks,
  selectBankSort,
  (banks, sort): BankComparison | null =>
    banks === null ? null : { banks: sort === null ? banks : sortBanks(banks, sort), sort },
);

/** Open current accounts: the choice of the salary account (US-BK-05). */
export const selectOpenCurrentAccounts = createSelector(selectAccountOverview, ({ open }) =>
  open.filter((account) => account.kind === 'current'),
);

/** The monthly overview (US-EK-03): the running month first, then the closed months newest first. */
export const selectMonthlyOverview = createSelector(
  selectMonthlyValues,
  (monthlyValues): MonthlyOverviewRow[] | null => {
    if (monthlyValues === null) {
      return null;
    }
    const closed = monthlyValues.closedMonths.map(({ month, values }): MonthlyOverviewRow => ({
      month,
      values,
      running: false,
    }));
    return [{ ...monthlyValues.current, running: true }, ...closed.reverse()];
  },
);

const { selectRouteParam } = getRouterSelectors();

/** The account of the statement page, from the URL (`accounts/:accountId`). */
export const selectStatementAccountId = createSelector(
  selectRouteParam('accountId'),
  (accountId) => (accountId ?? null) as AccountId | null,
);
export const selectStatementAccount = createSelector(
  selectStatementAccountId,
  selectAccounts,
  (accountId, accounts) => accounts.find((account) => account.id === accountId) ?? null,
);
export const selectStatement = createSelector(selectState, (state) => state.statement);
export const selectStatementFilter = createSelector(
  selectStatement,
  (statement) => statement.filter,
);
export const selectStatementTotal = createSelector(selectStatement, (statement) => statement.total);
export const selectStatementOffset = createSelector(
  selectStatement,
  (statement) => statement.offset,
);
export const selectStatementEntries = createSelector(
  selectStatement,
  (statement) => statement.entries,
);
export const selectStatementWindow = createSelector(
  selectStatementTotal,
  selectStatementOffset,
  selectStatementEntries,
  (total, offset, entries): StatementWindow => ({ total, offset, entries }),
);
export const selectStatementLoading = createSelector(
  selectStatement,
  (statement) => statement.loading,
);
export const selectStatementFilterActive = createSelector(
  selectStatementFilter,
  isStatementFilterActive,
);
/**
 * The account of the statement does not exist: the engine knows no such account, or the URL holds
 * no account ID at all (`invalid-command`).
 */
export const selectStatementNotFound = createSelector(
  selectStatement,
  ({ error }) =>
    isEngineCommandError(error, 'unknown-account') ||
    isEngineCommandError(error, 'invalid-command'),
);

/**
 * The standing orders with their accounts, in the order they were created (US-BK-10); `null`
 * until the first projection.
 */
export const selectStandingOrders = createSelector(
  selectStandingOrderViews,
  selectAccounts,
  (orders, accounts): StandingOrderEntry[] | null => {
    if (orders === null) {
      return null;
    }
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return orders.map((order) => ({
      ...order,
      from: byId.get(order.fromAccountId) ?? null,
      to: byId.get(order.toAccountId) ?? null,
    }));
  },
);

/**
 * Active standing orders by their next execution, earliest first; equal days in the order they
 * execute in the bank run (created first). For „Demnächst“ (AP 5.7, E-05).
 */
export const selectUpcomingStandingOrders = createSelector(selectStandingOrders, (orders) =>
  (orders ?? [])
    .filter((order) => order.nextExecution !== null)
    .sort((a, b) => (a.nextExecution as number) - (b.nextExecution as number)),
);
