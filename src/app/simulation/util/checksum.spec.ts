import fc from 'fast-check';

import { Checksum, checksumFloat64 } from './checksum';

/** Any double including ±0, ±Infinity, NaN and subnormals. */
const anyDouble = fc.double();

/** Bit patterns of NaN: exponent all ones, mantissa not zero, either sign. */
const nanBits = fc
  .record({
    sign: fc.boolean(),
    high: fc.integer({ min: 0, max: 0xfffff }),
    low: fc.integer({ min: 0, max: 0xffffffff }),
  })
  .filter(({ high, low }) => high !== 0 || low !== 0);

describe('Checksum', () => {
  const values = [0, -0, 1, -1.5, Math.PI, 1e300, 5e-324];

  it('hashes the little-endian Float64 bytes with MurmurHash3 x86_128', () => {
    // Reference vector frozen with AP 1.1 (TS §4.6).
    expect(checksumFloat64(values)).toBe('2c009b98300051e24712c850aeb6370b');
  });

  it('gives the same result for single values, arrays and typed arrays', () => {
    fc.assert(
      fc.property(fc.array(anyDouble, { maxLength: 40 }), (doubles) => {
        const single = new Checksum();
        for (const value of doubles) {
          single.addFloat64(value);
        }
        const expected = checksumFloat64(doubles);
        expect(single.digest()).toBe(expected);
        expect(new Checksum().addFloat64Array(Float64Array.from(doubles)).digest()).toBe(expected);
      }),
    );
  });

  it('depends on the order of the values', () => {
    fc.assert(
      fc.property(anyDouble, anyDouble, (a, b) => {
        fc.pre(!Object.is(a, b) && !(Number.isNaN(a) && Number.isNaN(b)));
        expect(checksumFloat64([a, b])).not.toBe(checksumFloat64([b, a]));
      }),
    );
  });

  it('distinguishes -0 from 0', () => {
    expect(checksumFloat64([0])).not.toBe(checksumFloat64([-0]));
  });

  it('hashes every NaN bit pattern like NaN', () => {
    const canonical = checksumFloat64([NaN]);
    fc.assert(
      fc.property(nanBits, ({ sign, high, low }) => {
        const bytes = new Float64Array(1);
        new Uint32Array(bytes.buffer).set([
          low,
          ((sign ? 0x80000000 : 0) | 0x7ff00000 | high) >>> 0,
        ]);
        expect(Number.isNaN(bytes[0])).toBe(true);
        expect(checksumFloat64(bytes)).toBe(canonical);
      }),
    );
  });

  it('includes uint32 values', () => {
    expect(new Checksum().addUint32(1).addFloat64(1).digest()).not.toBe(checksumFloat64([1]));
  });
});
