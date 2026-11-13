import fc from 'fast-check';

import { deriveSeedKey } from '@app/simulation/util/seed';

import {
  boundedDeviation,
  LIVING_COSTS_MAX_DEVIATION,
  livingCosts,
  livingCostsDeviation,
  livingCostsStreamKey,
} from './living-costs-logic';

import { arbCalendarMonth, arbSeedText } from '../../../testing/arbitraries';

const SEED = deriveSeedKey('kupfer-falke-731');
const APRIL_2030 = { year: 2030, month: 4 };

describe('living-costs-logic', () => {
  // TS §7.4: stream key `life/living-costs/<JJJJ-MM>`
  it.each([
    [{ year: 2030, month: 4 }, 'life/living-costs/2030-04'],
    [{ year: 2031, month: 12 }, 'life/living-costs/2031-12'],
  ])('keys the stream of %o as %s', (month, key) => {
    expect(livingCostsStreamKey(month)).toBe(key);
  });

  // TS §7.4: deviations beyond ±0.15 are set to the bound
  it.each([
    [0.2, 0.15],
    [-0.3, -0.15],
    [0.15, 0.15],
    [-0.15, -0.15],
    [0.05, 0.05],
    [-0.149, -0.149],
    [0, 0],
  ])('bounds %d to %d', (epsilon, bounded) => {
    expect(boundedDeviation(epsilon)).toBe(bounded);
  });

  it('keeps the deviation within the bounds for every seed and month', () => {
    fc.assert(
      fc.property(arbSeedText(), arbCalendarMonth(), (seed, month) => {
        const epsilon = livingCostsDeviation(deriveSeedKey(seed), month);
        expect(Math.abs(epsilon)).toBeLessThanOrEqual(LIVING_COSTS_MAX_DEVIATION);
      }),
    );
  });

  it('draws the same amount for the same seed and month', () => {
    fc.assert(
      fc.property(arbSeedText(), arbCalendarMonth(), (seed, month) => {
        expect(livingCosts(deriveSeedKey(seed), 180_000, month)).toBe(
          livingCosts(deriveSeedKey(seed), 180_000, month),
        );
      }),
    );
  });

  it('varies from month to month and between seeds', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({ year: 2030, month: i + 1 }));
    const amounts = months.map((month) => livingCosts(SEED, 180_000, month));
    expect(new Set(amounts).size).toBeGreaterThan(6);
    const other = deriveSeedKey('eisen-adler-123');
    expect(months.map((month) => livingCosts(other, 180_000, month))).not.toEqual(amounts);
  });

  it('charges base × (1 + ε) rounded to cents', () => {
    fc.assert(
      fc.property(
        arbSeedText(),
        arbCalendarMonth(),
        fc.integer({ min: 0, max: 10_000_000 }),
        (seed, month, base) => {
          const key = deriveSeedKey(seed);
          const amount = livingCosts(key, base, month);
          const exact = base * (1 + livingCostsDeviation(key, month));
          expect(Number.isInteger(amount)).toBe(true);
          expect(Math.abs(amount - exact)).toBeLessThanOrEqual(0.5 + 1e-6);
          expect(amount).toBeGreaterThanOrEqual(Math.floor(base * 0.85));
          expect(amount).toBeLessThanOrEqual(Math.ceil(base * 1.15));
        },
      ),
    );
  });

  it('charges nothing when the base is 0', () => {
    expect(livingCosts(SEED, 0, APRIL_2030)).toBe(0);
  });

  it('scales with the base', () => {
    const single = livingCosts(SEED, 180_000, APRIL_2030);
    const double = livingCosts(SEED, 360_000, APRIL_2030);
    expect(Math.abs(double - 2 * single)).toBeLessThanOrEqual(1);
    expect(single).not.toBe(180_000);
  });
});
