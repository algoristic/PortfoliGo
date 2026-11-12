import fc from 'fast-check';

import { detExp, detLog } from './det-math';
import { createStream } from './random-stream';
import { deriveSeedKey } from './seed';

const view = new DataView(new ArrayBuffer(8));

/** Position of a double on the number line, so that neighbouring doubles differ by 1. */
function ordinal(x: number): bigint {
  view.setFloat64(0, x);
  const bits = view.getBigInt64(0);
  return bits < 0n ? -(bits & 0x7fffffffffffffffn) : bits;
}

function ulpDistance(a: number, b: number): bigint {
  const distance = ordinal(a) - ordinal(b);
  return distance < 0n ? -distance : distance;
}

/** `actual` equals `expected` up to 1 ulp; NaN only where the oracle gives NaN. */
function expectWithinOneUlp(actual: number, expected: number): void {
  if (Number.isNaN(expected)) {
    expect(actual).toBeNaN();
  } else {
    expect(ulpDistance(actual, expected)).toBeLessThanOrEqual(1n);
  }
}

function maxUlpDistance(
  samples: number[],
  actual: (x: number) => number,
  expected: (x: number) => number,
): bigint {
  let max = 0n;
  for (const x of samples) {
    const distance = ulpDistance(actual(x), expected(x));
    if (distance > max) {
      max = distance;
    }
  }
  return max;
}

describe('det-math', () => {
  const seedKey = deriveSeedKey('det-math');

  function samples(key: string, count: number, draw: (u: number) => number): number[] {
    const rng = createStream(seedKey, key);
    return Array.from({ length: count }, () => draw(rng.nextFloat53()));
  }

  describe('detExp', () => {
    it('handles special values', () => {
      expect(detExp(NaN)).toBeNaN();
      expect(detExp(Infinity)).toBe(Infinity);
      expect(detExp(-Infinity)).toBe(0);
      expect(detExp(0)).toBe(1);
      expect(detExp(-0)).toBe(1);
      expect(detExp(710)).toBe(Infinity);
      expect(detExp(-746)).toBe(0);
      expect(detExp(1e-300)).toBe(1);
    });

    it('returns subnormal results near the underflow threshold', () => {
      const value = detExp(-740);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(2.2250738585072014e-308);
    });

    it('stays within 1 ulp of Math.exp on samples', () => {
      const wide = samples('exp/wide', 100_000, (u) => -745 + u * 1455);
      const narrow = samples('exp/narrow', 50_000, (u) => -2 + u * 4);
      const tiny = samples('exp/tiny', 10_000, (u) => (u - 0.5) * 1e-7);
      for (const set of [wide, narrow, tiny]) {
        expect(maxUlpDistance(set, detExp, Math.exp)).toBeLessThanOrEqual(1n);
      }
    });

    it('stays within 1 ulp of Math.exp for any double', () => {
      // V8's Math.exp is a port of the same fdlibm routine, so it serves as an independent oracle.
      fc.assert(
        fc.property(fc.double(), (x) => expectWithinOneUlp(detExp(x), Math.exp(x))),
        { numRuns: 2_000 },
      );
    });
  });

  describe('detLog', () => {
    it('handles special values', () => {
      expect(detLog(NaN)).toBeNaN();
      expect(detLog(-1)).toBeNaN();
      expect(detLog(-Infinity)).toBeNaN();
      expect(detLog(0)).toBe(-Infinity);
      expect(detLog(-0)).toBe(-Infinity);
      expect(detLog(Infinity)).toBe(Infinity);
      expect(detLog(1)).toBe(0);
    });

    it('handles subnormal arguments', () => {
      expect(detLog(5e-324)).toBe(Math.log(5e-324));
    });

    it('stays within 1 ulp of Math.log on samples', () => {
      const wide = samples('log/wide', 100_000, (u) => 10 ** (-307 + u * 615));
      const nearOne = samples('log/near-one', 50_000, (u) => 0.5 + u);
      const veryNearOne = samples('log/very-near-one', 10_000, (u) => 1 + (u - 0.5) * 1e-6);
      const subnormal = samples('log/subnormal', 10_000, (u) => u * 2.2250738585072014e-308);
      for (const set of [wide, nearOne, veryNearOne, subnormal]) {
        expect(maxUlpDistance(set, detLog, Math.log)).toBeLessThanOrEqual(1n);
      }
    });

    it('stays within 1 ulp of Math.log for any double', () => {
      fc.assert(
        fc.property(fc.double(), (x) => expectWithinOneUlp(detLog(x), Math.log(x))),
        { numRuns: 2_000 },
      );
    });

    it('inverts detExp up to rounding', () => {
      fc.assert(
        fc.property(fc.double({ min: -700, max: 700, noNaN: true }), (x) => {
          expect(Math.abs(detLog(detExp(x)) - x)).toBeLessThanOrEqual(
            1e-13 * Math.max(1, Math.abs(x)),
          );
        }),
      );
    });
  });
});
