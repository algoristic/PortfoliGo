import { DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

export type SavingsPlanId = `sp-${number}`;

/** Execution days of a savings plan: 1 to 28, so every month has the day (US-HD-05, TS §7.8). */
export const SAVINGS_PLAN_FIRST_DAY = 1;
export const SAVINGS_PLAN_LAST_DAY = 28;

/** Smallest monthly amount of a savings plan: 1,00 € (Festlegung AP 5.6b, TS §7.8). */
export const SAVINGS_PLAN_MIN_AMOUNT: Cents = 100;

/** What the player enters for a savings plan (US-HD-05, TS §7.8). */
export interface SavingsPlanSpec {
  depotId: DepotId;
  /** A savings-plan-eligible share or ETF (`savingsPlanEligible`). */
  instrumentId: string;
  /** Monthly amount in whole cents ≥ `SAVINGS_PLAN_MIN_AMOUNT`, costs included. */
  amount: Cents;
  /** Day of the month 1–28; on a day without trading the next trading day of the exchange. */
  day: number;
}

/** What a change may replace: depot and instrument stay. */
export type SavingsPlanChange = Pick<SavingsPlanSpec, 'amount' | 'day'>;

/**
 * A monthly purchase of an instrument for a fixed amount (US-HD-05, TS §7.8). The months up to
 * `handledUpTo` are done: executed, failed, or before the plan was created, changed or resumed. The
 * month after it executes at the open of the instrument's exchange on its execution day.
 */
export interface SavingsPlan extends SavingsPlanSpec {
  id: SavingsPlanId;
  createdAt: Tick;
  paused: boolean;
  /** Month key `JJJJ-MM` (`monthKey`) of the newest month that is done. */
  handledUpTo: string;
}

/** A savings plan as the UI sees it (TS §8.3): with its next execution, `null` when paused. */
export interface SavingsPlanView extends SavingsPlan {
  nextExecution: Tick | null;
}

/**
 * Codes with which the engine refuses a savings plan command (TS §8.2, §7.8); the first five are
 * shared with the order commands.
 */
export const SAVINGS_PLAN_COMMAND_ERRORS = [
  'unknown-depot',
  'depot-closed',
  'unknown-instrument',
  'invalid-amount',
  'amount-too-small',
  /** The instrument has no `savingsPlanEligible` (indices and smaller shares). */
  'not-savings-plan-eligible',
  'invalid-day',
  'unknown-savings-plan',
] as const;
export type SavingsPlanCommandError = (typeof SAVINGS_PLAN_COMMAND_ERRORS)[number];

/**
 * Why an execution fails (TS §7.8): the price is at the floor (E-22), the available amount of the
 * clearing account minus the reservations does not cover the amount, or the amount after costs
 * buys not even one millionth.
 */
export const SAVINGS_PLAN_FAILURES = [
  'price-floor',
  'insufficient-funds',
  'amount-too-small',
] as const;
export type SavingsPlanFailure = (typeof SAVINGS_PLAN_FAILURES)[number];

/** Shares, market value and costs of one execution at the ask (TS §7.8). */
export interface SavingsPlanFill {
  quantity: MicroUnits;
  /** Ask with the bank's venue mark-up, in euros. */
  price: number;
  marketValue: Cents;
  /** Savings plan costs of the bank (`savingsPlanFee` on the amount). */
  costs: Cents;
  /** Debit of the clearing account: market value + costs ≤ amount. */
  total: Cents;
}

/** Live estimate for the savings plan dialog (TS §11.8): costs, shares at the current ask, cover. */
export interface SavingsPlanPreview {
  costs: Cents;
  /** Shares at the current ask; `null` without a quote. */
  quantity: MicroUnits | null;
  /** Available amount of the clearing account minus reservations. */
  available: Cents;
  /** The clearing account covers the amount now. */
  covered: boolean;
}
