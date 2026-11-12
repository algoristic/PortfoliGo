import fc from 'fast-check';

import { createStream } from '@app/simulation/util/random-stream';
import { deriveSeedKey } from '@app/simulation/util/seed';

import {
  FICTIONAL_ISIN_PREFIX,
  formatId,
  isinCheckDigit,
  isValidIsin,
  nextIsin,
  nextTicker,
  tickerCandidates,
} from './identifier-logic';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

/** An ISIN body: two letters (country) and nine alphanumeric characters. */
const arbIsinBody = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.string({ unit: fc.constantFrom(...LETTERS), minLength: 2, maxLength: 2 }),
      fc.string({ unit: fc.constantFrom(...LETTERS, ...DIGITS), minLength: 9, maxLength: 9 }),
    )
    .map(([country, rest]) => country + rest);

describe('formatId', () => {
  it('pads the number to four digits', () => {
    expect(formatId('stk', 42)).toBe('stk-0042');
    expect(formatId('bnk', 1)).toBe('bnk-0001');
  });
});

describe('isinCheckDigit', () => {
  it('computes the check digit of published ISINs', () => {
    expect(isinCheckDigit('US037833100')).toBe(5);
    expect(isinCheckDigit('DE000716460')).toBe(0);
    expect(isinCheckDigit('GB000263494')).toBe(6);
    expect(isinCheckDigit('AU0000XVGZA')).toBe(3);
  });

  it('rejects invalid characters', () => {
    expect(() => isinCheckDigit('US03783310-')).toThrow(RangeError);
  });
});

describe('isValidIsin', () => {
  it('accepts valid and rejects altered identifiers', () => {
    expect(isValidIsin('US0378331005')).toBe(true);
    expect(isValidIsin('US0378331006')).toBe(false);
    expect(isValidIsin('US037833100')).toBe(false);
  });

  it('accepts every body with its check digit', () => {
    fc.assert(
      fc.property(arbIsinBody(), (body) => {
        expect(isValidIsin(body + isinCheckDigit(body))).toBe(true);
      }),
    );
  });

  it('detects every change of a single digit (Luhn)', () => {
    fc.assert(
      fc.property(arbIsinBody(), fc.nat(), fc.integer({ min: 1, max: 9 }), (body, at, shift) => {
        const isin = body + isinCheckDigit(body);
        const digitPositions = [...isin].flatMap((char, i) => (DIGITS.includes(char) ? [i] : []));
        const position = digitPositions[at % digitPositions.length];
        const changed = String((Number(isin[position]) + shift) % 10);
        const altered = isin.slice(0, position) + changed + isin.slice(position + 1);
        expect(isValidIsin(altered)).toBe(false);
      }),
    );
  });
});

describe('nextIsin', () => {
  it('draws unique valid identifiers with the fictional prefix', () => {
    const rng = createStream(deriveSeedKey('isin'), 'test');
    const used = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const isin = nextIsin(rng, used);
      expect(isin.startsWith(FICTIONAL_ISIN_PREFIX)).toBe(true);
      expect(isValidIsin(isin)).toBe(true);
    }
    expect(used.size).toBe(1000);
  });
});

describe('tickerCandidates', () => {
  it('derives 2–5 letter candidates from the name', () => {
    const candidates = tickerCandidates('Velora Micro AG');
    expect(candidates[0]).toBe('VELO');
    for (const candidate of candidates) {
      expect(candidate).toMatch(/^[A-Z]{2,5}$/);
    }
  });
});

describe('nextTicker', () => {
  it('hands out unique tickers even for identical names', () => {
    const rng = createStream(deriveSeedKey('ticker'), 'test');
    const used = new Set<string>();
    for (let i = 0; i < 200; i++) {
      expect(nextTicker(rng, 'Velora Micro AG', used)).toMatch(/^[A-Z]{2,5}$/);
    }
    expect(used.size).toBe(200);
  });
});
