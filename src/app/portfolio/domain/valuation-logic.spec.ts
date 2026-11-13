import { holdingsValue } from './valuation-logic';

describe('holdingsValue', () => {
  // TS §7.9: per holding shares × bid rounded to cents, then summed
  it('values every holding at its bid and sums the rounded values', () => {
    const bids = new Map([
      ['a', 99.9],
      ['b', 3.335],
    ]);
    expect(
      holdingsValue(
        [
          { instrumentId: 'a', quantity: 10_000_000 },
          { instrumentId: 'b', quantity: 500_000 },
          { instrumentId: 'b', quantity: 500_000 },
        ],
        (id) => bids.get(id) ?? Number.NaN,
      ),
      // 999,00 € + 2 × 1,67 € (1,6675 € each); 3,34 € unrounded would be 3,335 €
    ).toBe(99_900 + 167 + 167);
  });

  it('is 0 without holdings', () => {
    expect(holdingsValue([], () => Number.NaN)).toBe(0);
  });
});
