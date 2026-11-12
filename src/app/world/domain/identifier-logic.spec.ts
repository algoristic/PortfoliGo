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

describe('formatId', () => {
  it('pads the number to four digits', () => {
    expect(formatId('stk', 42)).toBe('stk-0042');
    expect(formatId('bnk', 1)).toBe('bnk-0001');
  });
});

describe('isinCheckDigit', () => {
  it('computes the check digit of known ISINs', () => {
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
