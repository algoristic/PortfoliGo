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

  it('produces normalised seeds of the expected shape', () => {
    let state = 1;
    const random = (): number => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    for (let i = 0; i < 1000; i++) {
      const seed = generateSeed(random);
      expect(seed).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]{2}$/);
      expect(normalizeSeed(seed)).toBe(seed);
    }
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
