import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { applyRate } from '@app/shared/domain/money-logic';

import { TaxAssessment, TaxYear } from './models/tax.model';

/** Flat tax on capital income without solidarity surcharge or church tax (E-11). */
export const CAPITAL_INCOME_TAX_RATE = 0.25;
/** Saver's allowance per calendar year, across all banks (E-11, US-ST-02). */
export const SAVER_ALLOWANCE: Cents = 100_000;

export function openTaxYear(year: number, lossCarryForward: Cents = 0): TaxYear {
  if (!Number.isSafeInteger(lossCarryForward) || lossCarryForward > 0) {
    throw new RangeError(`openTaxYear: invalid loss carry-forward ${lossCarryForward}`);
  }
  return { year, lossCarryForward, income: 0, withheld: 0 };
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
 * event, negative for a realised loss. Debit interest is not deductible and never passed here.
 */
export function assessTaxableIncome(state: TaxYear, amount: Cents): TaxAssessment {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`assessTaxableIncome: amount must be whole cents: ${amount}`);
  }
  const income = state.income + amount;
  const due = taxDue(state.lossCarryForward + income);
  return { state: { ...state, income, withheld: due }, delta: due - state.withheld };
}

/**
 * Year end (TS §7.7): a negative result becomes the loss carry-forward of the next year; the
 * unused saver's allowance lapses.
 */
export function closeTaxYear(state: TaxYear): TaxYear {
  return openTaxYear(state.year + 1, Math.min(0, netTaxableIncome(state)));
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
