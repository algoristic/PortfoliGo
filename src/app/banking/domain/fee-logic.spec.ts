import fc from 'fast-check';

import { custodyFee, fee } from './fee-logic';
import { CustodyFee, FeeModel } from './models/bank-conditions.model';

import { arbFeeModel } from '../../../testing/arbitraries';

const PERCENT_BOUNDED: FeeModel = { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 };
const FLAT_PLUS_PERCENT: FeeModel = {
  kind: 'flat-plus-percent',
  amount: 490,
  rate: 0.0025,
  max: 6_990,
};
const TIERED_A: FeeModel = {
  kind: 'tiered',
  tiers: [
    { upToVolume: 100_000, fee: { kind: 'flat', amount: 150 } },
    { upToVolume: 500_000, fee: { kind: 'flat', amount: 490 } },
    { upToVolume: null, fee: { kind: 'percent', rate: 0.001, min: 500 } },
  ],
};
const TIERED_B: FeeModel = {
  kind: 'tiered',
  tiers: [
    { upToVolume: 100_000, fee: { kind: 'flat', amount: 100 } },
    { upToVolume: 500_000, fee: { kind: 'flat', amount: 300 } },
  ],
};
const CUSTODY_PERCENT: CustodyFee = { kind: 'percent-pa', rate: 0.002, min: 3_000, max: 15_000 };
const CUSTODY_FLAT: CustodyFee = { kind: 'flat-pa', amount: 5_000 };

/** The bounds a model may reach for any volume; `undefined` if it has none. */
function boundsOf(model: FeeModel): { min?: number; max?: number } {
  return model.kind === 'percent' || model.kind === 'flat-plus-percent'
    ? { min: model.min, max: model.max }
    : {};
}

describe('fee-logic', () => {
  describe('fee', () => {
    // TS §7.3: fee examples per model, including min/max bounds
    it.each<[string, FeeModel, number, number]>([
      ['free', { kind: 'free' }, 1_000_000, 0],
      ['flat at zero volume', { kind: 'flat', amount: 490 }, 0, 490],
      ['flat at a large volume', { kind: 'flat', amount: 490 }, 5_000_000, 490],
      ['percent, rounded', { kind: 'percent', rate: 0.015 }, 12_345, 185],
      ['percent, half a cent away from zero', { kind: 'percent', rate: 0.0025 }, 100_200, 251],
      ['percent below min', PERCENT_BOUNDED, 200_000, 1_000],
      ['percent at min', PERCENT_BOUNDED, 400_000, 1_000],
      ['percent within bounds', PERCENT_BOUNDED, 1_000_000, 2_500],
      ['percent above max', PERCENT_BOUNDED, 3_000_000, 6_000],
      [
        'percent with min above max',
        { kind: 'percent', rate: 0.01, min: 1_000, max: 500 },
        200_000,
        500,
      ],
      ['flat plus percent', FLAT_PLUS_PERCENT, 100_000, 740],
      ['flat plus percent above max', FLAT_PLUS_PERCENT, 3_000_000, 6_990],
      [
        'flat plus percent below min',
        { kind: 'flat-plus-percent', amount: 100, rate: 0.001, min: 500 },
        100_000,
        500,
      ],
    ])('computes %s', (_case, model, volume, expected) => {
      expect(fee(model, volume)).toBe(expected);
    });

    // TS §7.3: tiered models A and B
    const TIERED: Record<string, FeeModel> = { A: TIERED_A, B: TIERED_B };
    it.each<[string, number, number]>([
      ['A', 50_000, 150],
      ['A', 100_000, 150],
      ['A', 100_001, 490],
      ['A', 500_000, 490],
      ['A', 600_000, 600],
      ['A', 2_000_000, 2_000],
      ['B', 1_000_000, 300],
    ])('prices tiered model %s at %d cents', (name, volume, expected) => {
      expect(fee(TIERED[name], volume)).toBe(expected);
    });

    it('rejects a tiered model without tiers', () => {
      expect(() => fee({ kind: 'tiered', tiers: [] }, 100)).toThrow(/at least one tier/);
    });

    it('is never negative and stays within the bounds of the applied model', () => {
      fc.assert(
        fc.property(arbFeeModel(), fc.integer({ min: 0, max: 1e10 }), (model, volume) => {
          const result = fee(model, volume);
          expect(Number.isSafeInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
          const { min, max } = boundsOf(model);
          if (max !== undefined) {
            expect(result).toBeLessThanOrEqual(max);
          }
          if (min !== undefined && (max === undefined || min <= max)) {
            expect(result).toBeGreaterThanOrEqual(min);
          }
        }),
      );
    });

    it('prices a tiered volume like the model of its tier', () => {
      fc.assert(
        fc.property(
          arbFeeModel().filter((model) => model.kind === 'tiered'),
          fc.integer({ min: 0, max: 2e7 }),
          (model, volume) => {
            if (model.kind !== 'tiered') {
              return;
            }
            const tier =
              model.tiers.find(({ upToVolume }) => upToVolume === null || volume <= upToVolume) ??
              model.tiers[model.tiers.length - 1];
            expect(fee(model, volume)).toBe(fee(tier.fee, volume));
          },
        ),
      );
    });
  });

  describe('custodyFee', () => {
    // TS §7.3: custody fee examples (yearly value times share of the year)
    it.each<[string, CustodyFee, number, number, number]>([
      ['none', { kind: 'none' }, 4_000_000, 0.25, 0],
      ['percent p. a. within bounds', CUSTODY_PERCENT, 4_000_000, 0.25, 2_000],
      ['percent p. a. below min', CUSTODY_PERCENT, 1_000_000, 0.25, 750],
      ['percent p. a. above max', CUSTODY_PERCENT, 10_000_000, 0.25, 3_750],
      ['percent p. a. for 30 of 91 days', CUSTODY_PERCENT, 4_000_000, 30 / 91, 2_637],
      ['flat p. a. per quarter', CUSTODY_FLAT, 123_456, 0.25, 1_250],
      ['flat p. a. per year', CUSTODY_FLAT, 0, 1, 5_000],
    ])('computes %s', (_case, custody, averageValue, yearShare, expected) => {
      expect(custodyFee(custody, averageValue, yearShare)).toBe(expected);
    });

    it('stays within the bounded yearly value times the share', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 0.01, noNaN: true }),
          fc.integer({ min: 0, max: 10_000 }),
          fc.integer({ min: 0, max: 100_000 }),
          fc.integer({ min: 0, max: 1e10 }),
          fc.constantFrom(0.25, 0.5, 1),
          (rate, min, extra, averageValue, yearShare) => {
            const max = min + extra;
            const result = custodyFee(
              { kind: 'percent-pa', rate, min, max },
              averageValue,
              yearShare,
            );
            expect(result).toBeGreaterThanOrEqual(Math.floor(min * yearShare));
            expect(result).toBeLessThanOrEqual(Math.ceil(max * yearShare));
          },
        ),
      );
    });
  });
});
