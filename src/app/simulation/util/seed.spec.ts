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
      expect(normalizeSeed('Möwe')).toBe('möwe');
    });
  });

  describe('deriveSeedKey', () => {
    it('returns the 128-bit hash of the normalised seed', () => {
      expect(Array.from(deriveSeedKey('kupfer-falke-731'))).toEqual([
        0x57d20f66, 0x03655bf6, 0x8392bc3d, 0x475c584a,
      ]);
    });

    it('returns the same key for spellings that normalise alike', () => {
      expect(Array.from(deriveSeedKey(' MÖWE '))).toEqual(Array.from(deriveSeedKey('möwe')));
    });

    it('returns different keys for different seeds', () => {
      expect(Array.from(deriveSeedKey('golden-1'))).not.toEqual(
        Array.from(deriveSeedKey('golden-2')),
      );
    });
  });
});
