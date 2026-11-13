import { BankComparisonKey, SortDirection } from '@app/banking/domain/bank-comparison-logic';

export const BANK_TABLE_COLUMNS = [
  'account-fee',
  'overdraft',
  'savings',
  'clearing',
  'custody-fee',
  'order-fee',
  'order-1000',
  'order-5000',
  'savings-plan',
  'venue',
  'fractional',
] as const;
export type BankTableColumnId = (typeof BANK_TABLE_COLUMNS)[number];

export interface BankTableColumn {
  id: BankTableColumnId;
  label: string;
  /** The feature the column sorts by; `null` for columns that don't sort. */
  sortKey: BankComparisonKey | null;
  /** `aria-sort` of a sortable column. */
  ariaSort: SortDirection | 'none';
  /** Icon of the sort button. */
  sortIcon: string;
  sortIconClass: string;
  cellClass: string;
}

export interface BankTableRow {
  id: string;
  name: string;
  type: string;
  openAccountLabel: string;
  cells: { id: BankTableColumnId; value: string; cellClass: string }[];
}
