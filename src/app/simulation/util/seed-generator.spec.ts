import fc from 'fast-check';

import { normalizeSeed } from './seed';
import { generateSeed } from './seed-generator';
import { SEED_FIRST_WORDS, SEED_SECOND_WORDS } from './seed-words';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('generateSeed', () => {
  it('combines two words and a three-digit number', () => {
    expect(generateSeed(sequence([0, 0, 0]))).toBe(
      `${SEED_FIRST_WORDS[0]}-${SEED_SECOND_WORDS[0]}-100`,
    );
    expect(generateSeed(sequence([99, 99, 899]))).toBe(
      `${SEED_FIRST_WORDS[99]}-${SEED_SECOND_WORDS[99]}-999`,
    );
  });

  it('produces normalised seeds from the word lists for any random source', () => {
    fc.assert(
      fc.property(fc.infiniteStream(fc.nat({ max: 0xffffffff })), (values) => {
        const random = values[Symbol.iterator]();
        const seed = generateSeed(() => random.next().value as number);
        const [first, second, number] = seed.split('-');
        expect(SEED_FIRST_WORDS).toContain(first);
        expect(SEED_SECOND_WORDS).toContain(second);
        expect(Number(number)).toBeGreaterThanOrEqual(100);
        expect(Number(number)).toBeLessThanOrEqual(999);
        expect(normalizeSeed(seed)).toBe(seed);
      }),
    );
  });

  it('rejects values that would bias the result', () => {
    expect(generateSeed(sequence([4294967295, 1, 2, 3]))).toBe(
      `${SEED_FIRST_WORDS[1]}-${SEED_SECOND_WORDS[2]}-103`,
    );
  });
});

describe('seed word lists', () => {
  it('contain unique lowercase ASCII words', () => {
    for (const words of [SEED_FIRST_WORDS, SEED_SECOND_WORDS]) {
      expect(new Set(words).size).toBe(words.length);
      for (const word of words) {
        expect(word).toMatch(/^[a-z]{2,10}$/);
      }
    }
  });
});
