import { SEED_FIRST_WORDS, SEED_SECOND_WORDS } from './seed-words';

const MIN_NUMBER = 100;
const MAX_NUMBER = 999;

/**
 * Suggests a shareable seed such as `kupfer-falke-731`. Suggestions are not part of the
 * simulation, so the caller passes the randomness (e.g. from `crypto.getRandomValues`).
 */
export function generateSeed(randomUint32: () => number): string {
  const first = SEED_FIRST_WORDS[pickIndex(randomUint32, SEED_FIRST_WORDS.length)];
  const second = SEED_SECOND_WORDS[pickIndex(randomUint32, SEED_SECOND_WORDS.length)];
  const number = MIN_NUMBER + pickIndex(randomUint32, MAX_NUMBER - MIN_NUMBER + 1);
  return `${first}-${second}-${number}`;
}

/** Unbiased index in [0, count) by rejection sampling. */
function pickIndex(randomUint32: () => number, count: number): number {
  const limit = 4294967296 - (4294967296 % count);
  let value = randomUint32() >>> 0;
  while (value >= limit) {
    value = randomUint32() >>> 0;
  }
  return value % count;
}
