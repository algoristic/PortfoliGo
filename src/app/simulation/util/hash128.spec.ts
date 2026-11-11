import { bytesToHex, Hash128, murmur3x86_128, utf8Encode, wordsToBytes } from './hash128';

describe('hash128', () => {
  describe('murmur3x86_128', () => {
    it('matches the reference implementation on fixed vectors', () => {
      const cases: [string, number, number[]][] = [
        ['', 0, [0x00000000, 0x00000000, 0x00000000, 0x00000000]],
        ['', 1, [0x88c4adec, 0x54d201b9, 0x54d201b9, 0x54d201b9]],
        ['a', 0, [0xa794933c, 0x5556b01b, 0x5556b01b, 0x5556b01b]],
        ['hello', 0, [0x2b2444a0, 0xdb91def7, 0x9adb31b6, 0x9adb31b6]],
        [
          'The quick brown fox jumps over the lazy dog',
          0,
          [0x2f1583c3, 0xecee2c67, 0x5d7bf66c, 0xe5e91d2c],
        ],
        ['portfoligo', 42, [0x4eeb318c, 0x4cd0842a, 0x7ddfd817, 0xe57add45]],
        ['möwe', 0, [0x007f6f18, 0x8ac3942c, 0xb0a5e866, 0xb0a5e866]],
      ];
      for (const [text, seed, expected] of cases) {
        expect(Array.from(murmur3x86_128(utf8Encode(text), seed))).toEqual(expected);
      }
    });

    it('passes the SMHasher verification test', () => {
      const hashes = new Uint8Array(256 * 16);
      for (let i = 0; i < 256; i++) {
        const key = Uint8Array.from({ length: i }, (_, j) => j);
        hashes.set(wordsToBytes(murmur3x86_128(key, 256 - i)), i * 16);
      }
      expect(murmur3x86_128(hashes, 0)[0]).toBe(0xb3ece62a);
    });
  });

  describe('Hash128', () => {
    it('yields the one-shot result for any chunking', () => {
      const bytes = utf8Encode('market/instrument/42/3650/bridge – some longer key text');
      const expected = Array.from(murmur3x86_128(bytes, 7));
      for (const chunkSize of [1, 3, 5, 16, 17, 100]) {
        const hash = new Hash128(7);
        for (let i = 0; i < bytes.length; i += chunkSize) {
          hash.update(bytes.subarray(i, i + chunkSize));
        }
        expect(Array.from(hash.digest())).toEqual(expected);
      }
    });

    it('yields the one-shot result when fed byte by byte', () => {
      const bytes = utf8Encode('market/factor/industry:software/2610');
      const hash = new Hash128(7);
      bytes.forEach((byte) => hash.updateByte(byte));
      expect(Array.from(hash.digest())).toEqual(Array.from(murmur3x86_128(bytes, 7)));
    });

    it('continues from a copied prefix state', () => {
      const prefix = new Hash128().update(utf8Encode('market/instrument/cmp-0001/'));
      for (const suffix of ['7', '1234', '12345678901234567890']) {
        const copy = new Hash128().update(utf8Encode('unrelated')).copyFrom(prefix);
        copy.update(utf8Encode(suffix));
        const expected = murmur3x86_128(utf8Encode(`market/instrument/cmp-0001/${suffix}`));
        expect(Array.from(copy.digest())).toEqual(Array.from(expected));
      }
    });
  });

  describe('bytesToHex', () => {
    it('prints the little-endian bytes of the hash', () => {
      const words = murmur3x86_128(utf8Encode('The quick brown fox jumps over the lazy dog'));
      expect(bytesToHex(wordsToBytes(words))).toBe('c383152f672ceeec6cf67b5d2c1de9e5');
    });
  });
});
