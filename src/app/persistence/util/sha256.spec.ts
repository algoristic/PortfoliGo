import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  // FIPS 180-2, appendix B (published test vectors); the last one, computed with Python's hashlib, checks UTF-8.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['ä', '33e6d73fee82904c8d7afb78de1154d1e8dc2a0edb08120e63df5b9385c2d9cc'],
  ])('hashes %j to %s', async (text, expected) => {
    expect(await sha256Hex(text)).toBe(expected);
  });
});
