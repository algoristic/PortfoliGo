import fc from 'fast-check';

import { REGION_IDS, SECTOR_IDS } from '@app/world/domain/models/taxonomy.model';

import {
  allocate,
  apportionCents,
  assetClassAllocation,
  regionAllocation,
  sectorAllocation,
} from './allocation-logic';
import { AllocationHolding } from './models/allocation.model';

// TS §7.9 „Allokation“: share A (1.100,00 €, North America, technology) and ETF E (1.910,10 €,
// index 60 % Europe / 40 % North America; 50 % financials, 30 % technology, 20 % health care)
const SHARE: AllocationHolding = {
  kind: 'stock',
  value: 110_000,
  regionId: 'north-america',
  sectorId: 'technology',
};
const ETF: AllocationHolding = {
  kind: 'etf',
  value: 191_010,
  composition: {
    regions: [
      { key: 'europe', weight: 0.6 },
      { key: 'north-america', weight: 0.4 },
    ],
    sectors: [
      { key: 'financials', weight: 0.5 },
      { key: 'technology', weight: 0.3 },
      { key: 'health-care', weight: 0.2 },
    ],
  },
};

describe('apportionCents', () => {
  // TS §7.9 „Allokation“: largest remainder, ties to the earlier part
  it.each([
    [10_000, [1, 1, 1], [3_334, 3_333, 3_333]],
    [5, [0.5, 0.5], [3, 2]],
    [1, [0.2, 0.3, 0.5], [0, 0, 1]],
    [191_010, [0.6, 0.4], [114_606, 76_404]],
    [7, [0, 1], [0, 7]],
  ])('splits %d by %o into %o', (total, weights, expected) => {
    expect(apportionCents(total, weights)).toEqual(expected);
  });

  it('rejects weights without a positive sum and negative totals', () => {
    expect(() => apportionCents(100, [0, 0])).toThrow(RangeError);
    expect(() => apportionCents(100, [1, -0.5])).toThrow(RangeError);
    expect(() => apportionCents(-1, [1])).toThrow(RangeError);
  });

  it('keeps the total to the cent and every part within a cent of its quota', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e12 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          fc.pre(weights.some((weight) => weight > 1e-9));
          const parts = apportionCents(total, weights);
          const sum = weights.reduce((acc, weight) => acc + weight, 0);
          expect(parts.reduce((acc, part) => acc + part, 0)).toBe(total);
          parts.forEach((part, index) => {
            expect(Number.isInteger(part)).toBe(true);
            expect(Math.abs(part - (total * weights[index]) / sum)).toBeLessThan(1 + 1e-6);
          });
        },
      ),
    );
  });
});

describe('regionAllocation', () => {
  // TS §7.9 „Allokation“
  it('splits the ETF by the regions of its index and adds the share', () => {
    expect(regionAllocation([SHARE, ETF])).toEqual([
      { key: 'north-america', value: 186_404, share: 186_404 / 301_010 },
      { key: 'europe', value: 114_606, share: 114_606 / 301_010 },
    ]);
  });

  it('keeps an ETF without composition unassigned', () => {
    expect(regionAllocation([SHARE, { ...ETF, composition: null }])).toEqual([
      { key: 'unassigned', value: 191_010, share: 191_010 / 301_010 },
      { key: 'north-america', value: 110_000, share: 110_000 / 301_010 },
    ]);
  });
});

describe('sectorAllocation', () => {
  // TS §7.9 „Allokation“
  it('splits the ETF by the sectors of its index and adds the share', () => {
    expect(sectorAllocation([SHARE, ETF])).toEqual([
      { key: 'technology', value: 167_303, share: 167_303 / 301_010 },
      { key: 'financials', value: 95_505, share: 95_505 / 301_010 },
      { key: 'health-care', value: 38_202, share: 38_202 / 301_010 },
    ]);
  });
});

describe('assetClassAllocation', () => {
  // TS §7.9 „Allokation“: with 989,90 € on the accounts
  it('adds the money on the accounts as „Liquidität“', () => {
    expect(assetClassAllocation([SHARE, ETF], 98_990)).toEqual([
      { key: 'etf', value: 191_010, share: 0.477525 },
      { key: 'stock', value: 110_000, share: 0.275 },
      { key: 'cash', value: 98_990, share: 0.247475 },
    ]);
  });

  it('counts an overdrawn balance as no money', () => {
    expect(assetClassAllocation([SHARE], -5_000)).toEqual([
      { key: 'stock', value: 110_000, share: 1 },
    ]);
  });
});

describe('allocate', () => {
  it('leaves out keys without a positive value and keeps ties in order of appearance', () => {
    expect(
      allocate([
        { key: 'b', value: 0 },
        { key: 'c', value: 50 },
        { key: 'a', value: 50 },
      ]),
    ).toEqual([
      { key: 'c', value: 50, share: 0.5 },
      { key: 'a', value: 50, share: 0.5 },
    ]);
  });
});

const arbWeights = <K extends string>(keys: readonly K[]) =>
  fc
    .uniqueArray(fc.constantFrom(...keys), { minLength: 1, maxLength: keys.length })
    .chain((chosen) =>
      fc
        .array(fc.double({ min: 0.001, max: 1, noNaN: true }), {
          minLength: chosen.length,
          maxLength: chosen.length,
        })
        .map((weights) => chosen.map((key, index) => ({ key, weight: weights[index] }))),
    );

const arbHolding: fc.Arbitrary<AllocationHolding> = fc.oneof(
  fc.record({
    kind: fc.constant('stock' as const),
    value: fc.integer({ min: 0, max: 1e11 }),
    regionId: fc.constantFrom(...REGION_IDS),
    sectorId: fc.constantFrom(...SECTOR_IDS),
  }),
  fc.record({
    kind: fc.constant('etf' as const),
    value: fc.integer({ min: 0, max: 1e11 }),
    composition: fc.option(
      fc.record({ regions: arbWeights(REGION_IDS), sectors: arbWeights(SECTOR_IDS) }),
      { nil: null },
    ),
  }),
);

describe('allocation with look-through', () => {
  it('keeps the value of the securities and gives shares that add up to 1', () => {
    fc.assert(
      fc.property(
        fc.array(arbHolding, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: -1e9, max: 1e11 }),
        (holdings, cash) => {
          const total = holdings.reduce((acc, holding) => acc + holding.value, 0);
          for (const entries of [regionAllocation(holdings), sectorAllocation(holdings)]) {
            expect(entries.reduce((acc, entry) => acc + entry.value, 0)).toBe(total);
            if (total > 0) {
              expect(entries.reduce((acc, entry) => acc + entry.share, 0)).toBeCloseTo(1, 9);
            }
          }
          const classes = assetClassAllocation(holdings, cash);
          expect(classes.reduce((acc, entry) => acc + entry.value, 0)).toBe(
            total + Math.max(0, cash),
          );
        },
      ),
    );
  });
});
