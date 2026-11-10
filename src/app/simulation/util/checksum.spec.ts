import { Checksum, checksumFloat64 } from './checksum';

describe('Checksum', () => {
  const values = [0, -0, 1, -1.5, Math.PI, 1e300, 5e-324];

  it('hashes the little-endian Float64 bytes with MurmurHash3 x86_128', () => {
    expect(checksumFloat64(values)).toBe('2c009b98300051e24712c850aeb6370b');
  });

  it('gives the same result for single values, arrays and typed arrays', () => {
    const single = new Checksum();
    for (const value of values) {
      single.addFloat64(value);
    }
    expect(single.digest()).toBe(checksumFloat64(values));
    expect(new Checksum().addFloat64Array(Float64Array.from(values)).digest()).toBe(
      checksumFloat64(values),
    );
  });

  it('depends on order and distinguishes -0 from 0', () => {
    expect(checksumFloat64([1, 2])).not.toBe(checksumFloat64([2, 1]));
    expect(checksumFloat64([0])).not.toBe(checksumFloat64([-0]));
  });

  it('hashes all NaN bit patterns alike', () => {
    const bytes = new Float64Array(1);
    new Uint32Array(bytes.buffer).set([1, 0x7ff00000]);
    expect(checksumFloat64(bytes)).toBe(checksumFloat64([NaN]));
  });

  it('includes uint32 values', () => {
    expect(new Checksum().addUint32(1).addFloat64(1).digest()).not.toBe(checksumFloat64([1]));
  });
});
