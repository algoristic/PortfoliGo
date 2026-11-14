import { BankSort } from '@app/banking/domain/bank-comparison-logic';
import { AccountKind } from '@app/banking/domain/models/account.model';
import { CalendarMonth, MonthlyValues } from '@app/banking/domain/models/household.model';
import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';
import { StatementEntry, StatementPeriod } from '@app/banking/domain/models/statement.model';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { Bank } from '@app/world/domain/models/bank.model';

/** The bank commands of the slice (TS §8.2); each has its own pending count. */
export const BANK_COMMANDS = [
  'openAccount',
  'closeAccount',
  'setSalaryAccount',
  'transfer',
  'createStandingOrder',
  'changeStandingOrder',
  'setStandingOrderPaused',
  'deleteStandingOrder',
] as const;
export type BankCommand = (typeof BANK_COMMANDS)[number];

/** Commands sent to the engine and not yet answered, per command. */
export type PendingBankCommands = Record<BankCommand, number>;

/** An account with its bank (name, type, conditions); `null` until the banks are loaded. */
export interface AccountEntry extends AccountView {
  bank: Bank | null;
}

/** Balances of the open accounts per kind and in total. */
export interface AccountTotals {
  byKind: Record<AccountKind, Cents>;
  total: Cents;
}

/** Filter of the statement page (US-BK-06); no `types` means all types. */
export interface StatementFilterState {
  period: StatementPeriod;
  types: TransactionType[];
  search: string;
}

/** Rows of the statement list from `start` (inclusive) to `end` (exclusive), as rendered. */
export interface StatementRange {
  start: number;
  end: number;
}

/**
 * The statement page in the store (TS §11.3): filter, number of matches and only the loaded window
 * of entries (`entries[i]` is row `offset + i`), never the whole journal.
 */
export interface StatementState {
  filter: StatementFilterState;
  /** Raised by every new query (entering, filter, search); replies of older ones are dropped. */
  generation: number;
  /** Matches of the filter; `null` until the first page of this query arrived. */
  total: number | null;
  offset: number;
  entries: StatementEntry[];
  range: StatementRange;
  loading: boolean;
  error?: unknown;
}

/** What the statement list shows: the number of rows and the loaded window. */
export interface StatementWindow {
  total: number | null;
  offset: number;
  entries: StatementEntry[];
}

/** A statement query without the account: offset and limit of the window to load. */
export interface StatementWindowRequest {
  offset: number;
  limit: number;
}

/** Open accounts in display order and the closed ones, newest closing first. */
export interface AccountOverview {
  open: AccountEntry[];
  closed: AccountEntry[];
}

/** The banks of the comparison in display order and the sort; `sort` `null`: world order. */
export interface BankComparison {
  banks: Bank[];
  sort: BankSort | null;
}

/** A month of the monthly overview (US-EK-03); `running` for the current month. */
export interface MonthlyOverviewRow {
  month: CalendarMonth;
  values: MonthlyValues;
  running: boolean;
}

/** A standing order with its accounts (US-BK-10); an account is `null` until the projection has it. */
export interface StandingOrderEntry extends StandingOrderView {
  from: AccountEntry | null;
  to: AccountEntry | null;
}
