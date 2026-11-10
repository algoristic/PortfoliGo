import { uniformInt } from '../../simulation/util/distributions';
import { RandomStream } from '../../simulation/util/random-stream';

/**
 * Country prefix of the fictional ISIN-format identifiers. `QP` lies in the user-assigned
 * ISO 3166 range QM–QZ and is never used by real ISINs (TS §5.4).
 */
export const FICTIONAL_ISIN_PREFIX = 'QP';

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ISIN_BODY_LENGTH = 9;
const TICKER_MIN_LENGTH = 2;
const TICKER_MAX_LENGTH = 5;
const MAX_ATTEMPTS = 1000;

/** Stable id such as `stk-0042`; `index` starts at 1. */
export function formatId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(4, '0')}`;
}

/** Check digit of an ISIN body (11 characters): letters become 10–35, then Luhn. */
export function isinCheckDigit(body: string): number {
  let digits = '';
  for (const char of body.toUpperCase()) {
    const value = ALPHANUMERIC.indexOf(char);
    if (value < 0) {
      throw new RangeError(`isinCheckDigit: invalid character ${char}`);
    }
    digits += String(value);
  }
  let sum = 0;
  // The check digit will be appended, so the rightmost digit of the body is doubled.
  for (let i = digits.length - 1, double = true; i >= 0; i--, double = !double) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidIsin(isin: string): boolean {
  return (
    /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) &&
    isinCheckDigit(isin.slice(0, 11)) === Number(isin[11])
  );
}

/** Draws an unused ISIN-format identifier with the fictional prefix. */
export function nextIsin(rng: RandomStream, used: Set<string>): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let body = FICTIONAL_ISIN_PREFIX;
    for (let i = 0; i < ISIN_BODY_LENGTH; i++) {
      body += ALPHANUMERIC[uniformInt(rng, 0, ALPHANUMERIC.length - 1)];
    }
    const isin = body + String(isinCheckDigit(body));
    if (!used.has(isin)) {
      used.add(isin);
      return isin;
    }
  }
  throw new Error('nextIsin: no free identifier found');
}

function lettersOf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^A-Za-z ]/g, '')
    .toUpperCase();
}

/** Ticker candidates derived from a name, in order of preference. */
export function tickerCandidates(name: string): string[] {
  const words = lettersOf(name)
    .split(' ')
    .filter((word) => word.length > 0);
  const first = words[0] ?? '';
  const initials = words.map((word) => word[0]).join('');
  const consonants = first.slice(0, 1) + first.slice(1).replace(/[AEIOU]/g, '');
  const candidates = [
    first.slice(0, 4),
    first.slice(0, 3),
    consonants.slice(0, 4),
    consonants.slice(0, 3),
    initials.slice(0, 4),
    first.slice(0, 3) + (words[1]?.[0] ?? ''),
    first.slice(0, 2) + (words[1]?.slice(0, 2) ?? ''),
    first.slice(0, 5),
  ];
  return candidates.filter(
    (candidate) => candidate.length >= TICKER_MIN_LENGTH && candidate.length <= TICKER_MAX_LENGTH,
  );
}

/** Picks the first free ticker for a name, falling back to drawn letters after the first two. */
export function nextTicker(rng: RandomStream, name: string, used: Set<string>): string {
  for (const candidate of tickerCandidates(name)) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const stem = (lettersOf(name).replace(/ /g, '') + 'XX').slice(0, 2);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let ticker = stem;
    const extra = uniformInt(rng, 1, TICKER_MAX_LENGTH - TICKER_MIN_LENGTH);
    for (let i = 0; i < extra; i++) {
      ticker += ALPHANUMERIC[uniformInt(rng, 10, ALPHANUMERIC.length - 1)];
    }
    if (!used.has(ticker)) {
      used.add(ticker);
      return ticker;
    }
  }
  throw new Error(`nextTicker: no free ticker for ${name}`);
}
