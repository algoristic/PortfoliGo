import fc from 'fast-check';

import {
  bidAsk,
  priceDecimals,
  priceStep,
  roundDownToStep,
  roundUpToStep,
} from './price-step-logic';

/** Price grid of TS §6.7: 0.01 € from 10 €, 0.001 € from 1 €, 0.0001 € below. */
function gridStepsPerEuro(price: number): number {
  if (price >= 10) {
    return 100;
  }
  return price >= 1 ? 1_000 : 10_000;
}

/** Number of grid steps; prices on the grid give integers up to binary artefacts. */
function steps(price: number, stepsPerEuro: number): number {
  return price * stepsPerEuro;
}

function expectOnGrid(price: number, stepsPerEuro: number): void {
  const count = steps(price, stepsPerEuro);
  expect(Math.abs(count - Math.round(count))).toBeLessThan(1e-6);
}

const arbPrice = fc.double({ min: 1e-4, max: 1e4, noNaN: true });
const arbStepsPerEuro = fc.constantFrom(100, 1_000, 10_000);

describe('price-step-logic', () => {
  describe('priceStep', () => {
    it('uses cents from 10 euros, tenths of a cent from 1 euro and below that 0.0001', () => {
      expect(priceStep(10)).toBe(0.01);
      expect(priceStep(250)).toBe(0.01);
      expect(priceStep(9.999)).toBe(0.001);
      expect(priceStep(1)).toBe(0.001);
      expect(priceStep(0.9999)).toBe(0.0001);
    });

    it('follows the grid of TS §6.7 for any price', () => {
      fc.assert(
        fc.property(arbPrice, (price) => {
          expect(priceStep(price)).toBe(1 / gridStepsPerEuro(price));
        }),
      );
    });
  });

  describe('priceDecimals', () => {
    it('returns the decimal places of the price grid', () => {
      expect(priceDecimals(10)).toBe(2);
      expect(priceDecimals(1)).toBe(3);
      expect(priceDecimals(0.5)).toBe(4);
    });
  });

  describe('roundDownToStep', () => {
    it('rounds down to the grid', () => {
      expect(roundDownToStep(12.3456, 0.01)).toBe(12.34);
      expect(roundDownToStep(8.0029, 0.001)).toBe(8.002);
    });

    it('keeps prices that already lie on the grid', () => {
      expect(roundDownToStep(8.002, 0.001)).toBe(8.002);
      expect(roundDownToStep(0.29, 0.01)).toBe(0.29);
    });
  });

  describe('roundUpToStep', () => {
    it('rounds up to the grid', () => {
      expect(roundUpToStep(12.3401, 0.01)).toBe(12.35);
      expect(roundUpToStep(0.12341, 0.0001)).toBe(0.1235);
    });

    it('keeps prices that already lie on the grid', () => {
      expect(roundUpToStep(7.998, 0.001)).toBe(7.998);
      expect(roundUpToStep(1.1, 0.01)).toBe(1.1);
    });
  });

  describe('roundDownToStep and roundUpToStep', () => {
    it('enclose any price between neighbouring grid points', () => {
      fc.assert(
        fc.property(arbPrice, arbStepsPerEuro, (price, stepsPerEuro) => {
          const step = 1 / stepsPerEuro;
          const down = roundDownToStep(price, step);
          const up = roundUpToStep(price, step);
          expectOnGrid(down, stepsPerEuro);
          expectOnGrid(up, stepsPerEuro);
          // Prices are taken as written (15 significant digits), so allow binary artefacts.
          expect(down).toBeLessThanOrEqual(price * (1 + 1e-12));
          expect(up).toBeGreaterThanOrEqual(price * (1 - 1e-12));
          expect(Math.round(steps(up - down, stepsPerEuro))).toBeLessThanOrEqual(1);
        }),
      );
    });

    it('keep any price on the grid unchanged', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1e7 }), arbStepsPerEuro, (count, stepsPerEuro) => {
          const price = count / stepsPerEuro;
          expect(roundDownToStep(price, 1 / stepsPerEuro)).toBe(price);
          expect(roundUpToStep(price, 1 / stepsPerEuro)).toBe(price);
        }),
      );
    });
  });

  describe('bidAsk', () => {
    it('puts bid and ask on the grid of the mid price, at least one step apart', () => {
      fc.assert(
        fc.property(arbPrice, fc.double({ min: 0, max: 0.05, noNaN: true }), (mid, spread) => {
          const stepsPerEuro = gridStepsPerEuro(mid);
          const step = 1 / stepsPerEuro;
          const { bid, ask } = bidAsk(mid, spread);
          expectOnGrid(bid, stepsPerEuro);
          expectOnGrid(ask, stepsPerEuro);
          expect(Math.round(steps(ask - bid, stepsPerEuro))).toBeGreaterThanOrEqual(1);
          const lower = mid * (1 - spread / 2);
          const upper = mid * (1 + spread / 2);
          // The bid is the grid point at or below the lower bound, the ask the one at or above
          // the upper bound (or one step above the bid).
          expect(bid).toBeLessThanOrEqual(lower * (1 + 1e-12));
          expect(bid).toBeGreaterThan(lower - step * (1 + 1e-9));
          expect(ask).toBeGreaterThanOrEqual(upper * (1 - 1e-12));
          expect(bid).toBeLessThanOrEqual(mid * (1 + 1e-12));
          expect(ask).toBeGreaterThanOrEqual(mid * (1 - 1e-12));
        }),
      );
    });

    it('keeps bid and ask apart at a mid price of 8 euros and a spread of 0.05 % (TS §6.7)', () => {
      expect(bidAsk(8, 0.0005)).toEqual({ bid: 7.998, ask: 8.002 });
    });

    it('rounds the bid down and the ask up', () => {
      expect(bidAsk(100, 0.001)).toEqual({ bid: 99.95, ask: 100.05 });
      expect(bidAsk(123.456, 0.001)).toEqual({ bid: 123.39, ask: 123.52 });
    });

    it('enforces a spread of at least one step', () => {
      expect(bidAsk(8, 0)).toEqual({ bid: 8, ask: 8.001 });
      expect(bidAsk(50, 0.0001)).toEqual({ bid: 49.99, ask: 50.01 });
    });

    it('uses the grid of the mid price', () => {
      expect(bidAsk(10, 0.001)).toEqual({ bid: 9.99, ask: 10.01 });
      expect(bidAsk(0.5, 0.002)).toEqual({ bid: 0.4995, ask: 0.5005 });
      // At exactly 1 € the grid of 0.001 € applies to both sides, also below 1 €.
      expect(bidAsk(1, 0.001)).toEqual({ bid: 0.999, ask: 1.001 });
    });
  });
});
