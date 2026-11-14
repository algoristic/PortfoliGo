import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import {
  CurrentAccountConditions,
  CustodyFee,
} from '@app/banking/domain/models/bank-conditions.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { PendingDistribution } from '@app/portfolio/domain/models/distribution.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

/** Calendar days „Demnächst“ looks ahead (TS §8.1, E-05). */
export const UPCOMING_DAYS = 14;
/** At most this many days: the bank run then settles at most one month in the window. */
export const MAX_UPCOMING_DAYS = 28;

/**
 * Kinds of plannable dates (TS §8.1, E-05) in the order they happen within one tick: payouts and
 * the bank run at 06:00 (its steps in booking order, standing orders last), then the openings
 * with ex-dates and savings plans, then the expiry of orders.
 */
export const UPCOMING_KINDS = [
  'dividend-payment',
  'salary',
  'living-costs',
  'account-fee',
  'custody-fee',
  'standing-order',
  'ex-dividend',
  'savings-plan',
  'order-expiry',
] as const;
export type UpcomingKind = (typeof UPCOMING_KINDS)[number];

/**
 * A plannable date. `amount` is the magnitude in cents, its direction follows from the kind
 * (salary and payouts in, living costs and fees out, transfers and savings plans between own
 * accounts); `null` when only the market could tell it (custody fee) or nothing is booked (ex-date,
 * order expiry). Living costs carry the base amount without the monthly variation (US-EK-02).
 */
export interface UpcomingEvent {
  kind: UpcomingKind;
  tick: Tick;
  amount: Cents | null;
  /** Dividend per share of an ex-date. */
  perShare?: Cents;
  accountId?: AccountId;
  /** For transfers of a standing order: the receiving account. */
  toAccountId?: AccountId;
  depotId?: DepotId;
  instrumentId?: string;
  /** Standing order, savings plan or order. */
  sourceId?: string;
}

/** A current account as far as its monthly fee is concerned (TS §7.4). */
export interface UpcomingFeeAccount {
  accountId: AccountId;
  openedAt: Tick;
  conditions: Pick<CurrentAccountConditions, 'monthlyFee' | 'feeWaiver'>;
  /** External deposits of the previous and of the running month so far. */
  depositsLastMonth: Cents;
  depositsThisMonth: Cents;
}

/** An open depot as far as its custody fee is concerned. */
export interface UpcomingCustodyDepot {
  depotId: DepotId;
  clearingAccountId: AccountId;
  custodyFee: CustodyFee;
}

/** What the bank run of the next days books, from the player state (TS §7.4). */
export interface UpcomingHousehold {
  /** Base amounts of the start conditions (US-EK-01, US-EK-02). */
  netIncome: Cents;
  livingCosts: Cents;
  salaryAccountId: AccountId;
  /** Open current accounts in account order. */
  currentAccounts: readonly UpcomingFeeAccount[];
  /** Open depots in depot order. */
  depots: readonly UpcomingCustodyDepot[];
}

/**
 * An announced ex-date of a held instrument (TS §6.5): the open of its exchange on the ex-date
 * and the credit on the payment date, for the shares held now.
 */
export interface AnnouncedDividend {
  depotId: DepotId;
  instrumentId: string;
  quantity: MicroUnits;
  cents: Cents;
  exTick: Tick;
  paymentTick: Tick;
}

/** Everything the worker knows of the next days (TS §8.1). */
export interface UpcomingInputs {
  household: UpcomingHousehold;
  announcedDividends: readonly AnnouncedDividend[];
  /** Payouts earned at past ex-dates and not yet credited. */
  pendingDistributions: readonly PendingDistribution[];
}
