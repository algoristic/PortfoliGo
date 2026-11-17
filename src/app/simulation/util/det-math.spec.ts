import fc from 'fast-check';

import { detExp, detLog } from './det-math';
import { createStream } from './random-stream';
import { deriveSeedKey } from './seed';
import {
  DET_EXP_REFERENCE,
  DET_LOG_REFERENCE,
  DetMathReference,
} from './testing/det-math-reference';

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

function fromBits(hex: string): number {
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}

function toBits(x: number): string {
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

/** A finite double as the exact fraction `mantissa · 2^exponent`. */
function exactBinary(x: number): { mantissa: bigint; exponent: number } {
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const sign = bits >> 63n === 1n ? -1n : 1n;
  return biased === 0
    ? { mantissa: sign * fraction, exponent: -1074 }
    : { mantissa: sign * (fraction | (1n << 52n)), exponent: biased - 1075 };
}

/**
 * Whether the double `x` lies less than one of its ulps from the decimal `reference`, computed
 * exactly with integers (independent of any floating-point function).
 */
function withinOneUlpOfDecimal(x: number, reference: string): boolean {
  const [digits, exponentText = '0'] = reference.toLowerCase().split('e');
  const [whole, fraction = ''] = digits.split('.');
  const decimalMantissa = BigInt(whole + fraction);
  const decimalExponent = Number(exponentText) - fraction.length;
  const { mantissa, exponent } = exactBinary(x);
  // ulp of x: 2^(exponent) for normal and subnormal doubles alike.
  const ulpExponent = exponent;
  // Compare |m · 2^e − d · 10^k| < 2^u after scaling all terms by 2^s · 10^t to integers.
  const s = Math.max(0, -exponent);
  const t = Math.max(0, -decimalExponent);
  const binary = mantissa * 2n ** BigInt(exponent + s) * 10n ** BigInt(t);
  const decimal = decimalMantissa * 10n ** BigInt(decimalExponent + t) * 2n ** BigInt(s);
  const ulp = 2n ** BigInt(ulpExponent + s) * 10n ** BigInt(t);
  const difference = binary > decimal ? binary - decimal : decimal - binary;
  return difference < ulp;
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
      // V8's Math.exp is a port of the same fdlibm routine: in Node this checks the port, not the
      // accuracy, and cannot tell detExp from Math.exp. The independent oracle is the frozen
      // reference table below (AP 7.3a).
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
  describe('frozen reference table (TS §4.4)', () => {
    // Exact values from Python `decimal` (80 digits), independent of any libm. The table catches
    // a changed port in every engine, where comparing with Math.exp/Math.log cannot.
    it.each([
      ['detExp', detExp, DET_EXP_REFERENCE],
      ['detLog', detLog, DET_LOG_REFERENCE],
    ] as const)(
      '%s reproduces the frozen results',
      (_name, fn: (x: number) => number, table: readonly DetMathReference[]) => {
        expect(table.length).toBeGreaterThan(150);
        for (const [input, result] of table) {
          expect(toBits(fn(fromBits(input))), input).toBe(result);
        }
      },
    );

    it.each([
      ['exp', DET_EXP_REFERENCE],
      ['log', DET_LOG_REFERENCE],
    ] as const)('holds results within 1 ulp of the exact %s', (_name, table) => {
      for (const [input, result, exact] of table) {
        expect(withinOneUlpOfDecimal(fromBits(result), exact), input).toBe(true);
      }
    });

    it('rejects a result two ulps away from the exact value', () => {
      const [, result, exact] = DET_EXP_REFERENCE[0];
      const x = fromBits(result);
      expect(withinOneUlpOfDecimal(x, exact)).toBe(true);
      const twoUlpsUp = fromBits((BigInt(`0x${result}`) + 2n).toString(16).padStart(16, '0'));
      expect(withinOneUlpOfDecimal(twoUlpsUp, exact)).toBe(false);
    });
  });
});
