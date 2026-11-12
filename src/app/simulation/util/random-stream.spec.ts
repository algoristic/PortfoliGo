import fc from 'fast-check';

import { correlation, mean, variance } from '@app/analysis/domain/statistics-logic';

import { utf8Encode } from './hash128';
import { createStream, RandomStream, StreamFamily } from './random-stream';
import { deriveSeedKey } from './seed';

import { expectWithinSigma, meanSe } from '../../../testing/statistics';

function take(stream: RandomStream, count: number): number[] {
  return Array.from({ length: count }, () => stream.nextUint32());
}

const arbState = fc.array(fc.nat({ max: 0xffffffff }), { minLength: 4, maxLength: 4 });

describe('RandomStream', () => {
  const seedKey = deriveSeedKey('kupfer-falke-731');

  describe('nextUint32', () => {
    it('implements sfc32', () => {
      expect(take(new RandomStream([1, 2, 3, 4]), 6)).toEqual([
        0x00000007, 0x00000022, 0x03600060, 0x0b421d78, 0xcc849c75, 0x17ce4c72,
      ]);
    });
  });

  describe('nextFloat32 and nextFloat53', () => {
    it('stay in [0, 1) for any state', () => {
      fc.assert(
        fc.property(arbState, (state) => {
          const stream = new RandomStream(state);
          for (let i = 0; i < 8; i++) {
            const float32 = stream.nextFloat32();
            const float53 = stream.nextFloat53();
            expect(float32 >= 0 && float32 < 1).toBe(true);
            expect(float53 >= 0 && float53 < 1).toBe(true);
          }
        }),
      );
      expect(new RandomStream([0, 0, -1, 0]).nextFloat32()).toBeLessThan(1);
    });
  });

  describe('nextFloat53', () => {
    it('has the mean and variance of a uniform distribution', () => {
      const stream = createStream(seedKey, 'test/float53');
      const n = 100_000;
      const values = Array.from({ length: n }, () => stream.nextFloat53());
      // Var(s²) of U(0, 1): (1/80 − 1/144) / n.
      expectWithinSigma(mean(values), 0.5, meanSe(Math.sqrt(1 / 12), n), 5, 'mean');
      expectWithinSigma(variance(values), 1 / 12, Math.sqrt((1 / 80 - 1 / 144) / n), 5, 'variance');
    });
  });
});

describe('createStream', () => {
  const seedKey = deriveSeedKey('kupfer-falke-731');

  it('produces the fixed reference sequence', () => {
    expect(take(createStream(seedKey, 'world/companies'), 8)).toEqual([
      0xcdc5f1de, 0xda1c7045, 0xde4f5407, 0x312dfefe, 0x12b6fd54, 0x3359dfb9, 0x175abb67,
      0x893a159d,
    ]);
  });

  it('reproduces the same sequence for the same seed and key', () => {
    const first = take(createStream(deriveSeedKey('golden-1'), 'market/instrument/7/42'), 1000);
    const second = take(createStream(deriveSeedKey('golden-1'), 'market/instrument/7/42'), 1000);
    expect(second).toEqual(first);
  });

  it('does not depend on other streams created or consumed in between', () => {
    const alone = take(createStream(seedKey, 'market/instrument/1/10'), 100);
    const other = createStream(seedKey, 'market/instrument/2/10');
    take(other, 500);
    const interleaved = createStream(seedKey, 'market/instrument/1/10');
    take(other, 500);
    expect(take(interleaved, 100)).toEqual(alone);
  });

  it('produces uncorrelated sequences for neighbouring keys and seeds', () => {
    const n = 20_000;
    const floats = (stream: RandomStream): number[] =>
      Array.from({ length: n }, () => stream.nextFloat53());
    const base = floats(createStream(seedKey, 'market/instrument/1/10'));
    const neighbours = [
      createStream(seedKey, 'market/instrument/1/11'),
      createStream(seedKey, 'market/instrument/2/10'),
      createStream(seedKey, 'market/instrument/1/10/bridge'),
      createStream(deriveSeedKey('kupfer-falke-732'), 'market/instrument/1/10'),
    ];
    // The sample correlation of independent sequences has a standard error of about 1/√n.
    for (const neighbour of neighbours) {
      expectWithinSigma(
        correlation(base, floats(neighbour)),
        0,
        1 / Math.sqrt(n),
        5,
        'correlation',
      );
    }
  });

  it('produces distinct first outputs across many keys', () => {
    // Birthday bound: 10,000 uniform uint32 values collide about 0.01 times on average.
    const firsts = new Set<number>();
    for (let day = 0; day < 10_000; day++) {
      firsts.add(createStream(seedKey, `market/regime/${day}`).nextUint32());
    }
    expect(firsts.size).toBeGreaterThan(9_990);
  });
});

describe('StreamFamily', () => {
  const seedKey = deriveSeedKey('kupfer-falke-731');

  it('creates the same streams as createStream with the full key', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }),
        fc.oneof(fc.nat({ max: 100_000 }), fc.maxSafeNat()),
        fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
        (prefix, n, suffix) => {
          const family = new StreamFamily(seedKey, prefix);
          const created = family.create(n, suffix === undefined ? undefined : utf8Encode(suffix));
          expect(take(created, 8)).toEqual(
            take(createStream(seedKey, `${prefix}${n}${suffix ?? ''}`), 8),
          );
        },
      ),
    );
  });

  it('rejects negative and fractional numbers', () => {
    const family = new StreamFamily(seedKey, 'market/regime/');
    expect(() => family.create(-1)).toThrow(RangeError);
    expect(() => family.create(1.5)).toThrow(RangeError);
  });
});
