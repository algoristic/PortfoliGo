import { fee } from '@app/banking/domain/fee-logic';
import { bankFeesAccount, MARKET_ACCOUNT } from '@app/banking/domain/ledger-logic';
import { Depot } from '@app/banking/domain/models/account.model';
import { FeeModel } from '@app/banking/domain/models/bank-conditions.model';
import { PostingDraft, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { availableAfterReservations } from '@app/banking/domain/overdraft-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { spreadCost } from '@app/portfolio/domain/cost-estimate-logic';
import { Cents, MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';
import { eurosToCentsDown, marketValue } from '@app/shared/domain/money-logic';

import {
  SAVINGS_PLAN_FIRST_DAY,
  SAVINGS_PLAN_LAST_DAY,
  SAVINGS_PLAN_MIN_AMOUNT,
  SavingsPlan,
  SavingsPlanChange,
  SavingsPlanCommandError,
  SavingsPlanFailure,
  SavingsPlanFill,
  SavingsPlanId,
  SavingsPlanPreview,
  SavingsPlanSpec,
} from './models/savings-plan.model';

/** `sp-<n>` from the player's counter of savings plans. */
export function savingsPlanId(sequence: number): SavingsPlanId {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`savings plan sequence must be a positive integer: ${sequence}`);
  }
  return `sp-${sequence}`;
}

/** What the engine knows about depot and instrument of a new savings plan. */
export interface SavingsPlanTarget {
  /** The player's depot with the ID; `null` when there is none. */
  depot: Pick<Depot, 'closedAt'> | null;
  /** `savingsPlanEligible` of the instrument; `null` for an unknown instrument. */
  eligible: boolean | null;
  /** Savings plan costs of the depot's bank; `null` when the depot is unknown. */
  fee: FeeModel | null;
}

/**
 * Depot, eligibility and costs of a new savings plan from the player's depots, the savings plan
 * costs per bank ID and the instruments' `savingsPlanEligible` (`null` for unknown IDs).
 */
export function savingsPlanTarget(
  spec: Pick<SavingsPlanSpec, 'depotId' | 'instrumentId'>,
  depots: readonly Pick<Depot, 'id' | 'bankId' | 'closedAt'>[],
  fees: ReadonlyMap<string, FeeModel>,
  eligible: (instrumentId: string) => boolean | null,
): SavingsPlanTarget {
  const depot = depots.find((candidate) => candidate.id === spec.depotId) ?? null;
  return {
    depot,
    eligible: eligible(spec.instrumentId),
    fee: depot === null ? null : (fees.get(depot.bankId) ?? null),
  };
}

/**
 * Checks a new savings plan (TS §7.8, US-HD-05): an open depot of the player, a savings-plan-eligible
 * instrument, then amount and day (`savingsPlanChangeError`). Funds are not checked here: they count
 * on the execution day.
 */
export function savingsPlanError(
  spec: SavingsPlanSpec,
  target: SavingsPlanTarget,
): SavingsPlanCommandError | null {
  if (target.depot === null || target.fee === null) {
    return 'unknown-depot';
  }
  if (target.depot.closedAt !== null) {
    return 'depot-closed';
  }
  if (target.eligible === null) {
    return 'unknown-instrument';
  }
  if (!target.eligible) {
    return 'not-savings-plan-eligible';
  }
  return savingsPlanChangeError(spec, target.fee);
}

/**
 * Checks amount and day (TS §7.8): whole cents of at least `SAVINGS_PLAN_MIN_AMOUNT` that are more
 * than the bank's savings plan costs (else nothing would ever be bought), and a day from 1 to 28.
 */
export function savingsPlanChangeError(
  change: SavingsPlanChange,
  fee: FeeModel,
): SavingsPlanCommandError | null {
  if (!Number.isSafeInteger(change.amount) || change.amount < 1) {
    return 'invalid-amount';
  }
  if (
    change.amount < SAVINGS_PLAN_MIN_AMOUNT ||
    savingsPlanCosts(fee, change.amount) >= change.amount
  ) {
    return 'amount-too-small';
  }
  return Number.isInteger(change.day) &&
    change.day >= SAVINGS_PLAN_FIRST_DAY &&
    change.day <= SAVINGS_PLAN_LAST_DAY
    ? null
    : 'invalid-day';
}

/** Savings plan costs of a bank (TS §5.7, §7.8): `savingsPlanFee` on the monthly amount. */
export function savingsPlanCosts(model: FeeModel, amount: Cents): Cents {
  return fee(model, amount);
}

/**
 * Shares for `budget` cents at `price` (TS §7.8): Stück = Budget / Brief, rounded down to
 * millionths. The largest quantity whose exact market value, rounded up to cents, stays within the
 * budget; its booked (commercially rounded) market value then never exceeds it either.
 */
export function savingsPlanQuantity(budget: Cents, price: number): MicroUnits {
  if (!(price > 0) || !Number.isFinite(price)) {
    throw new RangeError(`savingsPlanQuantity: invalid price ${price}`);
  }
  if (budget <= 0) {
    return 0;
  }
  const fits = (quantity: MicroUnits): boolean =>
    -eurosToCentsDown(-(quantity / MICRO_UNITS_PER_UNIT) * price) <= budget;
  // Budget in cents → euros (÷ 100) → shares (÷ price) → millionths (× 10⁶).
  let quantity = Math.max(0, Math.floor((budget * (MICRO_UNITS_PER_UNIT / 100)) / price));
  while (quantity > 0 && !fits(quantity)) {
    quantity--;
  }
  while (fits(quantity + 1)) {
    quantity++;
  }
  return quantity;
}

/**
 * One execution of a savings plan at the ask (TS §7.8): the costs on the amount, then
 * Stück = (Betrag − Kosten) / Brief on millionths (always fractions, whatever `fractionalShares`
 * says); the debit is market value + costs ≤ amount, the rest stays on the clearing account.
 */
export function savingsPlanFill(amount: Cents, ask: number, model: FeeModel): SavingsPlanFill {
  const costs = savingsPlanCosts(model, amount);
  const quantity = savingsPlanQuantity(amount - costs, ask);
  const value = marketValue(quantity, ask);
  return { quantity, price: ask, marketValue: value, costs, total: value + costs };
}

/** State of the depot at the execution (TS §7.8). */
export interface SavingsPlanExecutionContext {
  /** The instrument's mid price is at the floor (`isAtPriceFloor`, E-22). */
  atPriceFloor: boolean;
  /** Available amount of the clearing account minus the reservations of open buy orders. */
  available: Cents;
}

/**
 * Why an execution fails, or `null` (TS §7.8): the price floor (E-22), then the cover of the whole
 * amount by the available amount after reservations, then a fill without a single millionth.
 */
export function savingsPlanFailure(
  amount: Cents,
  fill: Pick<SavingsPlanFill, 'quantity'>,
  context: SavingsPlanExecutionContext,
): SavingsPlanFailure | null {
  if (context.atPriceFloor) {
    return 'price-floor';
  }
  if (amount > context.available) {
    return 'insufficient-funds';
  }
  return fill.quantity === 0 ? 'amount-too-small' : null;
}

/** Counter accounts of an execution: the depot's clearing account and bank. */
export interface SavingsPlanAccounts {
  clearingAccountId: Depot['clearingAccountId'];
  bankId: string;
}

/**
 * Booking of an execution (TS §7.2, §7.8): a `buy` on the clearing account against the market
 * (market value) and the bank's fee account (the savings plan costs, left out at 0), the shares as
 * unit posting on the depot. `params` match those of an order purchase, with the costs as
 * `orderFee` and no exchange fee, so that statement and monthly values treat both alike; the
 * estimated `spreadCost` comes from the mid of the quote (US-PF-07).
 */
export function savingsPlanTransaction(
  plan: Pick<SavingsPlan, 'id' | 'depotId' | 'instrumentId'>,
  fill: SavingsPlanFill,
  accounts: SavingsPlanAccounts,
  tick: Tick,
  mid: number,
): TransactionDraft {
  const postings: PostingDraft[] = [
    { account: accounts.clearingAccountId, amount: -fill.total },
    { account: MARKET_ACCOUNT, amount: fill.marketValue },
  ];
  if (fill.costs !== 0) {
    postings.push({ account: bankFeesAccount(accounts.bankId), amount: fill.costs });
  }
  return {
    tick,
    type: 'buy',
    postings,
    units: [{ depotId: plan.depotId, instrumentId: plan.instrumentId, quantity: fill.quantity }],
    refs: { savingsPlanId: plan.id, instrumentId: plan.instrumentId },
    params: {
      quantity: fill.quantity,
      price: fill.price,
      marketValue: fill.marketValue,
      orderFee: fill.costs,
      exchangeFee: 0,
      spreadCost: spreadCost('buy', fill.quantity, fill.price, mid),
    },
  };
}

/**
 * Preview of the savings plan dialog (TS §11.8): the costs on the amount, the shares at the current
 * ask (with the bank's mark-up) and whether the clearing account covers the amount now.
 */
export function savingsPlanPreview(
  amount: Cents,
  ask: number | null,
  model: FeeModel,
  clearingBalance: Cents,
  reserved: Cents,
): SavingsPlanPreview {
  const available = availableAfterReservations({ balance: clearingBalance, limit: null }, reserved);
  return {
    costs: savingsPlanCosts(model, amount),
    quantity: ask === null ? null : savingsPlanFill(amount, ask, model).quantity,
    available,
    covered: amount <= available,
  };
}
