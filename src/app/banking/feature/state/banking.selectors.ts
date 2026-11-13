import { createFeatureSelector, createSelector } from '@ngrx/store';

import { AccountId } from '@app/banking/domain/models/account.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { AccountEntry, AccountTotals, BankCommand } from './banking.model';
import { accountsAdapter, BANKING_FEATURE_KEY, BankingState } from './banking.reducer';

const selectState = createFeatureSelector<BankingState>(BANKING_FEATURE_KEY);
const { selectAll } = accountsAdapter.getSelectors();

/** All accounts of the player, closed ones included, in account order. */
export const selectAccountViews = createSelector(selectState, selectAll);
export const selectBanks = createSelector(selectState, (state) => state.banks);
export const selectNetWorth = createSelector(selectState, (state) => state.netWorth);
export const selectPending = createSelector(selectState, (state) => state.pending);

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
