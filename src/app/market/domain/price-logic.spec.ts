import fc from 'fast-check';

import { priceFromLog } from './price-logic';

const arbLogPrice = fc.double({ min: -60, max: 20, noNaN: true });
const arbFloor = fc.double({ min: 1e-4, max: 1, noNaN: true });

describe('priceFromLog', () => {
  it('returns the price for the log price', () => {
    expect(priceFromLog(Math.log(42.5), 0.01)).toBeCloseTo(42.5, 12);
  });

  it('never returns less than the floor', () => {
    expect(priceFromLog(-50, 0.01)).toBe(0.01);
    expect(priceFromLog(Math.log(0.01) - 1e-9, 0.01)).toBe(0.01);
  });

  it('is the exponential above the floor and the floor below it (TS §6.4)', () => {
    fc.assert(
      fc.property(arbLogPrice, arbFloor, (logPrice, floor) => {
        const price = priceFromLog(logPrice, floor);
        const exact = Math.exp(logPrice);
        expect(price).toBeGreaterThanOrEqual(floor);
        if (exact > floor * (1 + 1e-12)) {
          expect(Math.abs(price - exact)).toBeLessThanOrEqual(exact * 5e-16);
        } else if (exact < floor * (1 - 1e-12)) {
          expect(price).toBe(floor);
        }
      }),
    );
  });

  it('is monotone in the log price', () => {
    fc.assert(
      fc.property(arbLogPrice, arbLogPrice, arbFloor, (a, b, floor) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(priceFromLog(low, floor)).toBeLessThanOrEqual(priceFromLog(high, floor));
      }),
    );
  });
});
