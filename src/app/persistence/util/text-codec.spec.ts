import fc from 'fast-check';

import { base64ToBytes, bytesToBase64, gunzipBase64, gzipBase64 } from './text-codec';

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe('bytesToBase64 and base64ToBytes', () => {
  // RFC 4648, section 10 (published test vectors).
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %j as %j and back', (text, base64) => {
    expect(bytesToBase64(ascii(text))).toBe(base64);
    expect(base64ToBytes(base64)).toEqual(ascii(text));
  });

  it('encodes more bytes than one chunk', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it.each([
    ['a character outside the alphabet', 'Zm9v!'],
    ['a wrong length', 'Zm9vY'],
    ['padding in the middle', 'Zg==Zg=='],
  ])('rejects %s', (_label, text) => {
    expect(() => base64ToBytes(text)).toThrow(TypeError);
  });
});

describe('gzipBase64 and gunzipBase64', () => {
  it('reads a file of GNU gzip, also wrapped over lines', async () => {
    // `printf abc | gzip -n | base64`
    expect(await gunzipBase64('H4sIAAAAAAAAA0tMSgYAwkEkNQMAAAA=')).toBe('abc');
    expect(await gunzipBase64(' H4sIAAAAAAAA\nA0tMSgYAwkEk\r\nNQMAAAA=\n')).toBe('abc');
  });

  it('reads back every text', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'grapheme' }), async (text) => {
        const encoded = await gzipBase64(text);
        expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
        expect(await gunzipBase64(encoded)).toBe(text);
      }),
      { numRuns: 25 },
    );
  });

  it.each([
    ['no base64', 'not base64!'],
    ['base64 but no gzip', 'Zm9vYmFy'],
    ['a truncated gzip stream', 'H4sIAAAAAAAAA0tMSgYA'],
  ])('rejects %s', async (_label, text) => {
    await expect(gunzipBase64(text)).rejects.toThrow();
  });
});
