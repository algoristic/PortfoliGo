import { parsePriceInput, parseQuantityInput } from './order-input-logic';

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
