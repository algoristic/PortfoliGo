import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { sellLots } from '@app/portfolio/domain/lot-logic';
import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { applyRate } from '@app/shared/domain/money-logic';

import {
  SaleTaxPreview,
  TaxableIncomeKind,
  TaxAssessment,
  TaxYear,
  TaxYearSummary,
} from './models/tax.model';

/** Flat tax on capital income without solidarity surcharge or church tax (E-11). */
export const CAPITAL_INCOME_TAX_RATE = 0.25;
/** Saver's allowance per calendar year, across all banks (E-11, US-ST-02). */
export const SAVER_ALLOWANCE: Cents = 100_000;

export function openTaxYear(year: number, lossCarryForward: Cents = 0): TaxYear {
  if (!Number.isSafeInteger(lossCarryForward) || lossCarryForward > 0) {
    throw new RangeError(`openTaxYear: invalid loss carry-forward ${lossCarryForward}`);
  }
  return {
    year,
    lossCarryForward,
    income: 0,
    withheld: 0,
    interest: 0,
    distributions: 0,
    gains: 0,
    losses: 0,
    paid: 0,
    refunded: 0,
  };
}

/** Result of the year so far: loss carry-forward plus taxable income. */
export function netTaxableIncome(state: TaxYear): Cents {
  return state.lossCarryForward + state.income;
}

/** Tax due on a yearly result: 25 % of the part above the saver's allowance, rounded to cents. */
export function taxDue(net: Cents): Cents {
  return applyRate(Math.max(0, net - SAVER_ALLOWANCE), CAPITAL_INCOME_TAX_RATE);
}

/**
 * Recomputes the tax of the year after a taxable event (TS §7.7): `amount` is the income of the
 * event, negative for a realised loss; `kind` only sorts it into the yearly figures. Debit interest
 * is not deductible and never passed here.
 */
export function assessTaxableIncome(
  state: TaxYear,
  amount: Cents,
  kind: TaxableIncomeKind,
): TaxAssessment {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`assessTaxableIncome: amount must be whole cents: ${amount}`);
  }
  if (kind !== 'sale' && amount < 0) {
    throw new RangeError(`assessTaxableIncome: ${kind} cannot be negative: ${amount}`);
  }
  const income = state.income + amount;
  const due = taxDue(state.lossCarryForward + income);
  const delta = due - state.withheld;
  const sale = kind === 'sale' ? amount : 0;
  return {
    state: {
      ...state,
      income,
      withheld: due,
      interest: state.interest + (kind === 'interest' ? amount : 0),
      distributions: state.distributions + (kind === 'distribution' ? amount : 0),
      gains: state.gains + Math.max(0, sale),
      losses: state.losses + Math.min(0, sale),
      paid: state.paid + Math.max(0, delta),
      refunded: state.refunded + Math.max(0, -delta),
    },
    delta,
  };
}

/**
 * Year end (TS §7.7): a negative result becomes the loss carry-forward of the next year; the
 * unused saver's allowance lapses.
 */
export function closeTaxYear(state: TaxYear): TaxYear {
  return openTaxYear(state.year + 1, lossCarryForwardOf(state));
}

/** Loss the year carries into the next one (≤ 0): its result if negative, else 0. */
export function lossCarryForwardOf(state: TaxYear): Cents {
  return Math.min(0, netTaxableIncome(state));
}

/** Part of the saver's allowance that the year's result uses (US-ST-04). */
export function usedAllowance(state: TaxYear): Cents {
  return Math.min(SAVER_ALLOWANCE, Math.max(0, netTaxableIncome(state)));
}

/** The figures of a tax year for the tax overview (US-ST-04). */
export function taxYearSummary(state: TaxYear): TaxYearSummary {
  return {
    year: state.year,
    interest: state.interest,
    distributions: state.distributions,
    gains: state.gains,
    losses: state.losses,
    income: state.income,
    lossCarryForwardIn: state.lossCarryForward,
    usedAllowance: usedAllowance(state),
    paid: state.paid,
    refunded: state.refunded,
    withheld: state.withheld,
    lossCarryForwardOut: lossCarryForwardOf(state),
  };
}

/**
 * Tax a realized gain would withhold now, a loss's refund negative (TS §7.7), without changing the
 * tax year: the delta `assessTaxableIncome` would book.
 */
export function taxPreview(state: TaxYear, realizedGain: Cents): Cents {
  return assessTaxableIncome(state, realizedGain, 'sale').delta;
}

/**
 * Preview of a sale of `quantity` shares from `lots` for `proceeds` after costs (US-HD-02): cost
 * basis by FIFO and realized gain as the engine books them (TS §7.6), the tax (`taxPreview`) and
 * the net credit. Throws like `sellLots` when the lots hold fewer shares.
 */
export function saleTaxPreview(
  state: TaxYear,
  lots: readonly Lot[],
  quantity: MicroUnits,
  proceeds: Cents,
): SaleTaxPreview {
  const costBasis = sellLots(lots, quantity).cost;
  const realizedGain = proceeds - costBasis;
  const tax = taxPreview(state, realizedGain);
  return { costBasis, realizedGain, tax, net: proceeds - tax };
}

/** Transaction type that books a delta, `null` for 0. */
export function taxTransactionType(
  delta: Cents,
): Extract<TransactionType, 'tax' | 'tax-refund'> | null {
  if (delta > 0) {
    return 'tax';
  }
  return delta < 0 ? 'tax-refund' : null;
}
