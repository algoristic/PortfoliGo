import fc from 'fast-check';

import { deriveSeedKey, normalizeSeed } from './seed';

describe('seed', () => {
  describe('normalizeSeed', () => {
    it('trims surrounding whitespace and lowercases', () => {
      expect(normalizeSeed('  Kupfer-Falke-731 \n')).toBe('kupfer-falke-731');
    });

    it('keeps inner whitespace', () => {
      expect(normalizeSeed('Mein  Seed')).toBe('mein  seed');
    });

    it('applies Unicode NFC', () => {
      expect(normalizeSeed('Mo\u0308we')).toBe('m\u00f6we');
    });

    it('is idempotent', () => {
      fc.assert(
        fc.property(fc.string({ unit: 'grapheme', maxLength: 20 }), (seed) => {
          expect(normalizeSeed(normalizeSeed(seed))).toBe(normalizeSeed(seed));
        }),
      );
    });
  });

  describe('deriveSeedKey', () => {
    it('returns the 128-bit hash of the normalised seed', () => {
      // Reference vector frozen with AP 1.1 (TS §4.1).
      expect(Array.from(deriveSeedKey('kupfer-falke-731'))).toEqual([
        0x57d20f66, 0x03655bf6, 0x8392bc3d, 0x475c584a,
      ]);
    });

    it('returns the same key for spellings that normalise alike', () => {
      expect(Array.from(deriveSeedKey(' M\u00d6WE '))).toEqual(
        Array.from(deriveSeedKey('m\u00f6we')),
      );
    });

    it('ignores surrounding whitespace and the Unicode normal form', () => {
      fc.assert(
        fc.property(
          fc.string({ unit: 'grapheme', maxLength: 20 }),
          fc.constantFrom('NFC', 'NFD'),
          (seed, form) => {
            const variant = ` \t${seed.normalize(form)}\n `;
            expect(Array.from(deriveSeedKey(variant))).toEqual(Array.from(deriveSeedKey(seed)));
          },
        ),
      );
    });

    it('returns different keys for different seeds', () => {
      expect(Array.from(deriveSeedKey('golden-1'))).not.toEqual(
        Array.from(deriveSeedKey('golden-2')),
      );
    });
  });
});
