import { Cents } from '@app/shared/domain/models/money.model';

import { custodyFee, fee } from './fee-logic';
import { BankConditions, DepotConditions } from './models/bank-conditions.model';

/** Cost features the bank comparison sorts by (US-BK-01, TS §7.3 „Bankenvergleich“). */
export const BANK_COMPARISON_KEYS = [
  'accountFee',
  'overdraftRate',
  'savingsRate',
  'custodyFee',
  'orderCost1000',
  'orderCost5000',
] as const;
export type BankComparisonKey = (typeof BANK_COMPARISON_KEYS)[number];

export const SORT_DIRECTIONS = ['ascending', 'descending'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface BankSort {
  key: BankComparisonKey;
  direction: SortDirection;
}

/** Volumes of the example orders of the comparison. */
export const EXAMPLE_ORDER_VOLUMES = {
  orderCost1000: 100_000,
  orderCost5000: 500_000,
} as const satisfies Partial<Record<BankComparisonKey, Cents>>;

/** Depot value at which the comparison ranks the custody fees (one year). */
export const EXAMPLE_DEPOT_VALUE: Cents = 1_000_000;

/** What a bank and its conditions need for the comparison. */
export interface ComparedBank {
  id: string;
  name: string;
  conditions: BankConditions;
}

/** Cost of an order: order fee for the volume plus the exchange fee (TS §7.3, §7.8). */
export function orderCost(depot: DepotConditions, volume: Cents): Cents {
  return fee(depot.orderFee, volume) + depot.exchangeFee;
}

/** Rates sort the best first (highest savings rate), costs the cheapest first. */
export function defaultSortDirection(key: BankComparisonKey): SortDirection {
  return key === 'savingsRate' ? 'descending' : 'ascending';
}

/** Sorting by the same feature again reverses the direction; another feature starts at its default. */
export function nextBankSort(current: BankSort | null, key: BankComparisonKey): BankSort {
  if (current?.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { key, direction: defaultSortDirection(key) };
}

/**
 * The values a feature compares, the first one first; `null` when the bank does not offer it
 * (TS §7.3): the account fee as paid with the fee waiver met, then without it; the overdraft rate,
 * then with the surcharge; the savings rate; the custody fee of a year at `EXAMPLE_DEPOT_VALUE`;
 * the example orders with the exchange fee.
 */
export function bankSortValues(
  conditions: BankConditions,
  key: BankComparisonKey,
): readonly number[] | null {
  const { currentAccount, savingsAccount, depot } = conditions;
  switch (key) {
    case 'accountFee':
      return currentAccount === null
        ? null
        : [currentAccount.feeWaiver ? 0 : currentAccount.monthlyFee, currentAccount.monthlyFee];
    case 'overdraftRate':
      return currentAccount === null
        ? null
        : [
            currentAccount.overdraft.rate,
            currentAccount.overdraft.rate + currentAccount.overdraft.toleratedSurcharge,
          ];
    case 'savingsRate':
      return savingsAccount === null ? null : [savingsAccount.rate];
    case 'custodyFee':
      return [custodyFee(depot.custodyFee, EXAMPLE_DEPOT_VALUE, 1)];
    case 'orderCost1000':
    case 'orderCost5000':
      return [orderCost(depot, EXAMPLE_ORDER_VOLUMES[key])];
  }
}

/**
 * Banks sorted by a feature (US-BK-01): by its values in the direction, banks without the offer
 * always last, ties by name (German collation) and ID. Returns a new array.
 */
export function sortBanks<T extends ComparedBank>(banks: readonly T[], sort: BankSort): T[] {
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return banks
    .map((bank) => ({ bank, values: bankSortValues(bank.conditions, sort.key) }))
    .sort(
      (a, b) =>
        compareValues(a.values, b.values, sign) ||
        a.bank.name.localeCompare(b.bank.name, 'de') ||
        a.bank.id.localeCompare(b.bank.id),
    )
    .map(({ bank }) => bank);
}

function compareValues(
  a: readonly number[] | null,
  b: readonly number[] | null,
  sign: number,
): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return sign * (a[i] - b[i]);
    }
  }
  return 0;
}
