import fc from 'fast-check';

import { AmountInputResult, formatAmountInput, parseAmountInput } from './amount-input';
import { setFormatLanguage } from './locale';

const NBSP = ' ';
/** Largest amount with 13 integer digits: 9.999.999.999.999,99 €. */
const MAX_CENTS = 999_999_999_999_999;

const amount = (cents: number): AmountInputResult => ({ kind: 'amount', cents });
const INVALID: AmountInputResult = { kind: 'invalid' };
const EMPTY: AmountInputResult = { kind: 'empty' };

describe('amount-input', () => {
  describe('parseAmountInput', () => {
    // TS §11.8: German number format, dots group thousands, a comma separates the cents
    it.each<[string, AmountInputResult]>([
      ['10.000', amount(1_000_000)],
      ['10000', amount(1_000_000)],
      ['10000,5', amount(1_000_050)],
      ['1.234,56', amount(123_456)],
      ['1.234.567,8', amount(123_456_780)],
      ['0', amount(0)],
      ['0,01', amount(1)],
      [',5', amount(50)],
      ['10,', amount(1_000)],
      ['007', amount(700)],
      ['  2.500 €', amount(250_000)],
      [`1.800${NBSP}€`, amount(180_000)],
      ['1800€', amount(180_000)],
      ['-3,2', amount(-320)],
      ['−1.000', amount(-100_000)],
      ['-0', amount(0)],
      ['9999999999999,99', amount(MAX_CENTS)],
      ['', EMPTY],
      ['   ', EMPTY],
      [' € ', EMPTY],
      ['10000000000000', INVALID],
      ['abc', INVALID],
      ['10.00', INVALID],
      ['1.0000', INVALID],
      ['10.000.0', INVALID],
      ['.500', INVALID],
      ['1,234', INVALID],
      ['1,2,3', INVALID],
      ['12a', INVALID],
      ['1 000', INVALID],
      ['-', INVALID],
      [',', INVALID],
      ['+5', INVALID],
      ['5-', INVALID],
      ['€ 5', INVALID],
      ['1e3', INVALID],
    ])('reads %j as %j', (text, expected) => {
      expect(parseAmountInput(text)).toEqual(expected);
    });

    it('never yields negative zero', () => {
      const result = parseAmountInput('-0,00');
      expect(result.kind === 'amount' && Object.is(result.cents, -0)).toBe(false);
    });
  });

  describe('formatAmountInput', () => {
    it.each([
      [1_000_000, '10.000'],
      [123_456, '1.234,56'],
      [1_000_050, '10.000,50'],
      [50, '0,50'],
      [0, '0'],
      [-0, '0'],
      [-320, '-3,20'],
      [-100_000, '-1.000'],
      [100_000_000, '1.000.000'],
      [MAX_CENTS, '9.999.999.999.999,99'],
    ])('shows %d cents as %s', (cents, expected) => {
      expect(formatAmountInput(cents)).toBe(expected);
    });

    it('reads every formatted amount back to the same cents', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: BigInt(-MAX_CENTS), max: BigInt(MAX_CENTS) }).map(Number),
          (cents) => {
            expect(parseAmountInput(formatAmountInput(cents))).toEqual(amount(cents || 0));
          },
        ),
      );
    });

    it('reads every amount typed without separators back to the same cents', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: BigInt(MAX_CENTS) }).map(Number), (cents) => {
          const euros = Math.floor(cents / 100);
          const rest = String(cents % 100).padStart(2, '0');
          expect(parseAmountInput(`${euros},${rest}`)).toEqual(amount(cents));
        }),
      );
    });
  });

  // TS §11.9: in English commas group thousands and a dot separates the cents (E-36)
  describe('in English', () => {
    afterEach(() => setFormatLanguage('de'));

    it.each<[string, AmountInputResult]>([
      ['10,000', amount(1_000_000)],
      ['10000.5', amount(1_000_050)],
      ['1,234.56', amount(123_456)],
      ['1,234,567.8', amount(123_456_780)],
      ['.5', amount(50)],
      ['-3.2', amount(-320)],
      ['2,500 €', amount(250_000)],
      ['', EMPTY],
      ['1.234,56', INVALID],
      ['10,00', INVALID],
      ['1.2.3', INVALID],
      ['1,0000', INVALID],
    ])('reads %j as %j', (text, expected) => {
      setFormatLanguage('en');
      expect(parseAmountInput(text)).toEqual(expected);
    });

    it.each([
      [1_000_000, '10,000'],
      [123_456, '1,234.56'],
      [50, '0.50'],
      [-320, '-3.20'],
    ])('shows %d cents as %s', (cents, expected) => {
      setFormatLanguage('en');
      expect(formatAmountInput(cents)).toBe(expected);
    });

    it('reads every formatted amount back to the same cents', () => {
      setFormatLanguage('en');
      fc.assert(
        fc.property(
          fc.bigInt({ min: BigInt(-MAX_CENTS), max: BigInt(MAX_CENTS) }).map(Number),
          (cents) => {
            expect(parseAmountInput(formatAmountInput(cents))).toEqual(amount(cents || 0));
          },
        ),
      );
    });

    it('reads with explicit separators regardless of the language', () => {
      expect(parseAmountInput('1,234.56', { group: ',', decimal: '.' })).toEqual(amount(123_456));
      expect(parseAmountInput('1.234,56', { group: '.', decimal: ',' })).toEqual(amount(123_456));
    });
  });
});
