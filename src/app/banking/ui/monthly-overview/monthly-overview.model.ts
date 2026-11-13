import { CalendarMonth, MonthlyValues } from '@app/banking/domain/models/household.model';

/** A month of the overview; `running` for the current month. */
export interface MonthlyOverviewMonth {
  month: CalendarMonth;
  values: MonthlyValues;
  running: boolean;
}

export const MONTHLY_OVERVIEW_COLUMNS = [
  'income',
  'living-costs',
  'fees',
  'credit-interest',
  'debit-interest',
  'taxes',
  'dividends',
  'savings-rate',
] as const;
export type MonthlyOverviewColumnId = (typeof MONTHLY_OVERVIEW_COLUMNS)[number];

export interface MonthlyOverviewRowView {
  id: string;
  label: string;
  running: boolean;
  cells: { id: MonthlyOverviewColumnId; value: string }[];
}
