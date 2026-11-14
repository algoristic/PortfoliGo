import { Cents } from '@app/shared/domain/models/money.model';

import { EMPLOYER_ACCOUNT, LIVING_COSTS_ACCOUNT, TAX_OFFICE_ACCOUNT } from './ledger-logic';
import { MonthlyValues } from './models/household.model';
import { LedgerAccountId, TransactionDraft } from './models/ledger.model';

type MonthlyValueKey = keyof MonthlyValues;
type CategoryKey = Exclude<
  MonthlyValueKey,
  'orderFees' | 'savingsPlanFees' | 'accountFees' | 'custodyFees' | 'spreadCosts' | 'terCosts'
>;

const BANK_FEES = /^external:bank:.+:fees$/;
const BANK_INTEREST = /^external:bank:.+:interest$/;
const ISSUER = 'external:issuer:';
/** Counterparties of earnings pay the player: their postings are negative. */
const EARNINGS: readonly CategoryKey[] = ['income', 'creditInterest', 'dividends'];

export function emptyMonthlyValues(): MonthlyValues {
  return {
    income: 0,
    livingCosts: 0,
    fees: 0,
    creditInterest: 0,
    debitInterest: 0,
    taxes: 0,
    dividends: 0,
    orderFees: 0,
    savingsPlanFees: 0,
    accountFees: 0,
    custodyFees: 0,
    spreadCosts: 0,
    terCosts: 0,
  };
}

/**
 * Adds a transaction to the values of its month (TS §7.4). Each posting on an external account
 * counts by that counterparty: employer → income, living costs, bank fees, bank interest (paid by
 * the bank → credit interest, received → debit interest), tax office (refunds negative), issuers →
 * dividends. The opening balance, the market and own transfers don't count. Bank fees also count
 * by the transaction type (US-PF-07): purchases and sales → order fees (savings plans with
 * `refs.savingsPlanId` → savings plan costs), `custody-fee` → custody fees, all others → account
 * fees. An execution's `params.spreadCost` adds to the estimated spread costs.
 */
export function addToMonthlyValues(
  values: MonthlyValues,
  transaction: Pick<TransactionDraft, 'type' | 'postings' | 'refs' | 'params'>,
): MonthlyValues {
  const result = { ...values };
  for (const { account, amount } of transaction.postings) {
    const key = categoryOf(account, amount);
    if (key !== null) {
      result[key] += EARNINGS.includes(key) ? -amount : amount;
    }
    if (key === 'fees') {
      result[feeKindOf(transaction)] += amount;
    }
  }
  const spread = transaction.params?.['spreadCost'];
  if (typeof spread === 'number' && (transaction.type === 'buy' || transaction.type === 'sell')) {
    result.spreadCosts += spread;
  }
  return result;
}

/** Adds the estimated TER costs of a day in unrounded cents (US-PF-07, TS §7.4). */
export function addTerCosts(values: MonthlyValues, cents: number): MonthlyValues {
  return cents === 0 ? values : { ...values, terCosts: values.terCosts + cents };
}

/** Income, credit interest and dividends. */
export function monthlyEarnings(values: MonthlyValues): Cents {
  return values.income + values.creditInterest + values.dividends;
}

/** Living costs, fees, debit interest and net taxes. */
export function monthlySpending(values: MonthlyValues): Cents {
  return values.livingCosts + values.fees + values.debitInterest + values.taxes;
}

/** (earnings − spending) / earnings; `null` without positive earnings (US-EK-03). */
export function savingsRate(values: MonthlyValues): number | null {
  const earnings = monthlyEarnings(values);
  return earnings > 0 ? (earnings - monthlySpending(values)) / earnings : null;
}

function feeKindOf(
  transaction: Pick<TransactionDraft, 'type' | 'refs'>,
): 'orderFees' | 'savingsPlanFees' | 'accountFees' | 'custodyFees' {
  switch (transaction.type) {
    case 'buy':
    case 'sell':
      return transaction.refs?.['savingsPlanId'] === undefined ? 'orderFees' : 'savingsPlanFees';
    case 'custody-fee':
      return 'custodyFees';
    default:
      return 'accountFees';
  }
}

function categoryOf(account: LedgerAccountId, amount: number): CategoryKey | null {
  if (account === EMPLOYER_ACCOUNT) {
    return 'income';
  }
  if (account === LIVING_COSTS_ACCOUNT) {
    return 'livingCosts';
  }
  if (account === TAX_OFFICE_ACCOUNT) {
    return 'taxes';
  }
  if (BANK_FEES.test(account)) {
    return 'fees';
  }
  if (BANK_INTEREST.test(account)) {
    return amount < 0 ? 'creditInterest' : 'debitInterest';
  }
  return account.startsWith(ISSUER) ? 'dividends' : null;
}
