import {
  bidAsk,
  priceDecimals,
  priceStep,
  roundDownToStep,
  roundUpToStep,
} from './price-step-logic';

describe('price-step-logic', () => {
  describe('priceStep', () => {
    it('uses cents from 10 euros, tenths of a cent from 1 euro and below that 0.0001', () => {
      expect(priceStep(10)).toBe(0.01);
      expect(priceStep(250)).toBe(0.01);
      expect(priceStep(9.999)).toBe(0.001);
      expect(priceStep(1)).toBe(0.001);
      expect(priceStep(0.9999)).toBe(0.0001);
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

  describe('bidAsk', () => {
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
    });
  });
});
