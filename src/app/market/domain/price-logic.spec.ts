import { priceFromLog } from './price-logic';

describe('priceFromLog', () => {
  it('returns the price for the log price', () => {
    expect(priceFromLog(Math.log(42.5), 0.01)).toBeCloseTo(42.5, 12);
  });

  it('never returns less than the floor', () => {
    expect(priceFromLog(-50, 0.01)).toBe(0.01);
    expect(priceFromLog(Math.log(0.01) - 1e-9, 0.01)).toBe(0.01);
  });
});
