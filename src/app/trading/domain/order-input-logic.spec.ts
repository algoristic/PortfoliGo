import fc from 'fast-check';

import { formatPriceInput, parsePriceInput, parseQuantityInput } from './order-input-logic';

// TS §11.8: number fields of the order ticket in German format.
describe('parseQuantityInput', () => {
  it.each([
    ['10', 10_000_000],
    ['1.000', 1_000_000_000],
    ['0,5', 500_000],
    [',5', 500_000],
    ['10,', 10_000_000],
    ['2,123456', 2_123_456],
    ['0,000001', 1],
    [' 3 ', 3_000_000],
    ['0', 0],
    ['999.999.999', 999_999_999_000_000],
  ])('reads %j as %d millionths', (text, value) => {
    expect(parseQuantityInput(text)).toEqual({ kind: 'value', value });
  });

  it.each(['', '   '])('reads %j as empty', (text) => {
    expect(parseQuantityInput(text)).toEqual({ kind: 'empty' });
  });

  it.each(['abc', '-1', '1,0000001', '1.00', '1,2,3', ',', '1.000.0', '1000000000', '1e3'])(
    'rejects %j',
    (text) => {
      expect(parseQuantityInput(text)).toEqual({ kind: 'invalid' });
    },
  );
});

describe('parsePriceInput', () => {
  it.each([
    ['99,9', 99.9],
    ['100,10', 100.1],
    ['1.234,50', 1234.5],
    ['0,0125', 0.0125],
    ['105', 105],
  ])('reads %j as %d €', (text, value) => {
    expect(parsePriceInput(text)).toEqual({ kind: 'value', value });
  });

  it('reads an empty field as empty', () => {
    expect(parsePriceInput('')).toEqual({ kind: 'empty' });
  });

  it.each(['0,00001', '-5', '1,2,3', 'x'])('rejects %j', (text) => {
    expect(parsePriceInput(text)).toEqual({ kind: 'invalid' });
  });
});

describe('formatPriceInput', () => {
  // TS §11.8: the fields of a change start with the order's prices.
  it.each([
    [99.5, '99,50'],
    [105, '105,00'],
    [1234.5, '1234,50'],
    [0.0125, '0,0125'],
    [8.002, '8,002'],
    [0.1, '0,10'],
    [99.9999, '99,9999'],
  ])('shows %d € as %j', (price, text) => {
    expect(formatPriceInput(price)).toBe(text);
  });

  it('reads back every price with up to four decimal places', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999_999 }), (units) => {
        const price = units / 10_000;
        expect(parsePriceInput(formatPriceInput(price))).toEqual({ kind: 'value', value: price });
      }),
    );
  });
});

// TS §11.9: in English commas group thousands and a dot separates the decimal places (E-36).
describe('in English', () => {
  const EN = { group: ',', decimal: '.' };

  it.each([
    ['1,000', 1_000_000_000],
    ['0.5', 500_000],
    ['.5', 500_000],
    ['2.123456', 2_123_456],
  ])('reads the quantity %j as %d millionths', (text, value) => {
    expect(parseQuantityInput(text, EN)).toEqual({ kind: 'value', value });
  });

  it.each(['1.000.0', '0,5', '1,00', '1.0000001'])('rejects the quantity %j', (text) => {
    expect(parseQuantityInput(text, EN)).toEqual({ kind: 'invalid' });
  });

  it.each([
    ['99.9', 99.9],
    ['1,234.50', 1234.5],
    ['0.0125', 0.0125],
  ])('reads the price %j as %d €', (text, value) => {
    expect(parsePriceInput(text, EN)).toEqual({ kind: 'value', value });
  });

  it('rejects a German price', () => {
    expect(parsePriceInput('99,90', EN)).toEqual({ kind: 'invalid' });
  });

  it.each([
    [99.5, '99.50'],
    [1234.5, '1234.50'],
    [0.0125, '0.0125'],
  ])('shows %d € as %j', (price, text) => {
    expect(formatPriceInput(price, EN)).toBe(text);
  });

  it('reads back every price with up to four decimal places', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999_999 }), (units) => {
        const price = units / 10_000;
        expect(parsePriceInput(formatPriceInput(price, EN), EN)).toEqual({
          kind: 'value',
          value: price,
        });
      }),
    );
  });
});
