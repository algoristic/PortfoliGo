import { CalendarMonth } from '@app/banking/domain/models/household.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { FirstStep } from '@app/dashboard/domain/models/first-steps.model';
import { UpcomingKind } from '@app/dashboard/domain/models/upcoming.model';
import { Cents } from '@app/shared/domain/models/money.model';

/** A date of „Demnächst“ with the names its text needs (TS §8.1). */
export interface UpcomingEntry {
  key: string;
  kind: UpcomingKind;
  tick: Tick;
  /** Magnitude; its direction follows from the kind. `null` without a plannable amount. */
  amount: Cents | null;
  perShare: Cents | null;
  /** Instrument of ex-dates, payouts, savings plans and orders. */
  instrumentName: string | null;
  /** Account of fees; source of a standing order. */
  accountName: string | null;
  /** Target of a standing order. */
  toAccountName: string | null;
}

/** „Demnächst“: `null` entries while the first query runs. */
export interface UpcomingView {
  entries: UpcomingEntry[] | null;
  /** Days the list looks ahead. */
  days: number;
}

/** The largest positions (PS §10.3), linked to the position detail. */
export interface TopPositionEntry {
  instrumentId: string;
  name: string;
  /** `null` while the quote is missing. */
  value: Cents | null;
  gainRatio: number | null;
  share: number | null;
}

/** A watchlist entry with its live price. */
export interface WatchlistEntry {
  instrumentId: string;
  name: string;
  last: number | null;
  changeRatio: number | null;
}

/** The first entries of the watchlist and how many there are in all. */
export interface WatchlistSummary {
  entries: WatchlistEntry[];
  total: number;
}

/** The cash flow of the running month (US-EK-03). */
export interface CashflowView {
  month: CalendarMonth;
  earnings: Cents;
  spending: Cents;
  savingsRate: number | null;
}

/** „Erste Schritte“ (US-UI-10); `null` view while hidden. */
export interface FirstStepsView {
  steps: FirstStep[];
  done: number;
}

/** A date of the dividend calendar (US-MK-06) with the instrument's name. */
export interface DividendCalendarRow {
  key: string;
  instrumentId: string;
  name: string;
  exTick: Tick;
  paymentTick: Tick;
  perShare: Cents;
  /** `null` for watchlist instruments without a holding. */
  expected: Cents | null;
  /** The ex-date has passed; the payout is earned. */
  earned: boolean;
}
