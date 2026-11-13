import fc from 'fast-check';

import {
  BANK_COMPARISON_KEYS,
  bankSortValues,
  ComparedBank,
  nextBankSort,
  orderCost,
  sortBanks,
} from './bank-comparison-logic';
import { BankConditions, DepotConditions } from './models/bank-conditions.model';

const EXCHANGE_DEPOT: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'free' },
  exchangeFee: 0,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0.1,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};

function branch(
  monthlyFee: number,
  overdraftRate: number,
  savingsRate: number,
  custodyRate: number,
  custodyMin: number,
  exchangeFee: number,
): BankConditions {
  return {
    currentAccount: {
      monthlyFee,
      overdraft: { limitIncomeFactor: 2, rate: overdraftRate, toleratedSurcharge: 0.04 },
    },
    savingsAccount: { rate: savingsRate, payout: 'quarterly' },
    depot: {
      ...EXCHANGE_DEPOT,
      custodyFee: { kind: 'percent-pa', rate: custodyRate, min: custodyMin },
      orderFee: { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 },
      exchangeFee,
    },
  };
}

function direct(
  monthlyFee: number,
  overdraftRate: number,
  savingsRate: number,
  orderFlat: number,
  orderMax: number,
): BankConditions {
  return {
    currentAccount: {
      monthlyFee,
      feeWaiver: { minMonthlyDeposits: 70_000 },
      overdraft: { limitIncomeFactor: 2, rate: overdraftRate, toleratedSurcharge: 0.045 },
    },
    savingsAccount: { rate: savingsRate, payout: 'monthly' },
    depot: {
      ...EXCHANGE_DEPOT,
      orderFee: { kind: 'flat-plus-percent', amount: orderFlat, rate: 0.0025, max: orderMax },
    },
  };
}

function broker(orderFlat: number, exchangeFee: number): BankConditions {
  return {
    currentAccount: null,
    savingsAccount: null,
    depot: { ...EXCHANGE_DEPOT, orderFee: { kind: 'flat', amount: orderFlat }, exchangeFee },
  };
}

// TS §7.3 „Bankenvergleich“: the example banks of the table.
const BANKS: ComparedBank[] = [
  { id: 'b1', name: 'Isane Bank', conditions: branch(1_110, 0.1385, 0.0025, 0.0019, 2_810, 300) },
  { id: 'b2', name: 'Belent Bank', conditions: branch(810, 0.129, 0.004, 0.0014, 4_430, 160) },
  { id: 'b3', name: 'Valum Direktbank', conditions: direct(540, 0.0945, 0.023, 530, 6_440) },
  { id: 'b4', name: 'Serara Direkt', conditions: direct(530, 0.073, 0.018, 400, 6_190) },
  { id: 'b5', name: 'Darara Invest', conditions: broker(460, 210) },
  { id: 'b6', name: 'Helova', conditions: broker(90, 0) },
];

function ids(banks: readonly ComparedBank[]): string[] {
  return banks.map((bank) => bank.id);
}

describe('orderCost', () => {
  // TS §7.3 „Bankenvergleich“: order fee plus exchange fee
  it.each([
    ['b1', 100_000, 1_300],
    ['b1', 500_000, 1_550],
    ['b2', 100_000, 1_160],
    ['b3', 100_000, 780],
    ['b3', 500_000, 1_780],
    ['b4', 500_000, 1_650],
    ['b5', 100_000, 670],
    ['b6', 500_000, 90],
  ])('costs %s for an order of %d cents %d cents', (id, volume, expected) => {
    const bank = BANKS.find((candidate) => candidate.id === id);
    expect(orderCost(bank?.conditions.depot ?? EXCHANGE_DEPOT, volume)).toBe(expected);
  });
});

describe('sortBanks', () => {
  // TS §7.3 „Bankenvergleich“: order of the example banks per feature
  it.each([
    ['accountFee', 'ascending', ['b4', 'b3', 'b2', 'b1', 'b5', 'b6']],
    ['accountFee', 'descending', ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']],
    ['overdraftRate', 'ascending', ['b4', 'b3', 'b2', 'b1', 'b5', 'b6']],
    ['savingsRate', 'descending', ['b3', 'b4', 'b2', 'b1', 'b5', 'b6']],
    ['savingsRate', 'ascending', ['b1', 'b2', 'b4', 'b3', 'b5', 'b6']],
    ['custodyFee', 'ascending', ['b5', 'b6', 'b4', 'b3', 'b1', 'b2']],
    ['custodyFee', 'descending', ['b2', 'b1', 'b5', 'b6', 'b4', 'b3']],
    ['orderCost1000', 'ascending', ['b6', 'b4', 'b5', 'b3', 'b2', 'b1']],
    ['orderCost5000', 'ascending', ['b6', 'b5', 'b2', 'b1', 'b4', 'b3']],
    ['orderCost5000', 'descending', ['b3', 'b4', 'b1', 'b2', 'b5', 'b6']],
  ] as const)('sorts by %s %s', (key, direction, expected) => {
    expect(ids(sortBanks(BANKS, { key, direction }))).toEqual(expected);
  });

  it('keeps banks without the offer last and orders them by name', () => {
    const sorted = sortBanks(BANKS, { key: 'accountFee', direction: 'descending' });
    expect(sorted.slice(-2).map((bank) => bank.name)).toEqual(['Darara Invest', 'Helova']);
  });

  it('returns a permutation and leaves the input unchanged', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(BANKS),
        fc.constantFrom(...BANK_COMPARISON_KEYS),
        fc.boolean(),
        (banks, key, ascending) => {
          const before = ids(banks);
          const sorted = sortBanks(banks, {
            key,
            direction: ascending ? 'ascending' : 'descending',
          });
          expect(ids(banks)).toEqual(before);
          expect([...ids(sorted)].sort()).toEqual([...before].sort());
        },
      ),
    );
  });

  it('orders by the first value in the direction, unoffered banks last', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(BANKS),
        fc.constantFrom(...BANK_COMPARISON_KEYS),
        fc.boolean(),
        (banks, key, ascending) => {
          const sorted = sortBanks(banks, {
            key,
            direction: ascending ? 'ascending' : 'descending',
          });
          const firsts = sorted.map((bank) => bankSortValues(bank.conditions, key)?.[0] ?? null);
          for (let i = 1; i < firsts.length; i++) {
            const [previous, current] = [firsts[i - 1], firsts[i]];
            if (previous === null) {
              expect(current).toBeNull();
            } else if (current !== null) {
              expect(ascending ? previous <= current : previous >= current).toBe(true);
            }
          }
        },
      ),
    );
  });
});

describe('bankSortValues', () => {
  it('ranks a waived account fee as free, then by the monthly fee', () => {
    expect(bankSortValues(BANKS[2].conditions, 'accountFee')).toEqual([0, 540]);
    expect(bankSortValues(BANKS[0].conditions, 'accountFee')).toEqual([1_110, 1_110]);
  });

  it('ranks the custody fee of a year at 10.000 €', () => {
    // 0,19 % of 10.000 € is 19 €, below the minimum of 28,10 €.
    expect(bankSortValues(BANKS[0].conditions, 'custodyFee')).toEqual([2_810]);
    expect(bankSortValues(BANKS[3].conditions, 'custodyFee')).toEqual([0]);
  });

  it('has no current account and savings values for brokers', () => {
    for (const key of ['accountFee', 'overdraftRate', 'savingsRate'] as const) {
      expect(bankSortValues(BANKS[4].conditions, key)).toBeNull();
    }
  });
});

describe('nextBankSort', () => {
  it.each([
    [null, 'accountFee', 'accountFee', 'ascending'],
    [null, 'savingsRate', 'savingsRate', 'descending'],
    [{ key: 'accountFee', direction: 'ascending' }, 'accountFee', 'accountFee', 'descending'],
    [{ key: 'accountFee', direction: 'descending' }, 'accountFee', 'accountFee', 'ascending'],
    [{ key: 'savingsRate', direction: 'descending' }, 'savingsRate', 'savingsRate', 'ascending'],
    [{ key: 'accountFee', direction: 'descending' }, 'orderCost1000', 'orderCost1000', 'ascending'],
  ] as const)('turns %o and a click on %s into %s %s', (current, key, expectedKey, direction) => {
    expect(nextBankSort(current, key)).toEqual({ key: expectedKey, direction });
  });
});
