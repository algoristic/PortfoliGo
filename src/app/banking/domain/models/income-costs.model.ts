import { Cents } from '@app/shared/domain/models/money.model';

import { CalendarMonth } from './household.model';

/** Earnings of a month from investments and accounts (US-PF-07). */
export interface IncomeMonth {
  month: CalendarMonth;
  /** Dividends and fund distributions before tax. */
  dividends: Cents;
  creditInterest: Cents;
}

/** Kinds of costs per year (US-PF-07); the last two are estimates, not bookings. */
export const COST_KINDS = [
  'orderFees',
  'savingsPlanFees',
  'accountFees',
  'custodyFees',
  'debitInterest',
  'spreadCosts',
  'terCosts',
] as const;
export type CostKind = (typeof COST_KINDS)[number];

/** Estimated kinds: hidden in prices, never booked. */
export const ESTIMATED_COST_KINDS: readonly CostKind[] = ['spreadCosts', 'terCosts'];

/** Earnings and costs of a calendar year (US-PF-07, TS §7.4). */
export interface IncomeCostsYear {
  year: number;
  /** The year of the running month: values so far. */
  running: boolean;
  /** Months of the year with values, newest first. */
  months: IncomeMonth[];
  dividends: Cents;
  creditInterest: Cents;
  /** Costs by kind in whole cents; the TER estimate is rounded once per year. */
  costs: Record<CostKind, Cents>;
  /** All costs, estimated ones included. */
  totalCosts: Cents;
  /** Of which estimated (spread and TER). */
  estimatedCosts: Cents;
}
