import { createStream, RandomStream, StreamFamily } from './random-stream';
import { deriveSeedKey } from './seed';

function take(stream: RandomStream, count: number): number[] {
  return Array.from({ length: count }, () => stream.nextUint32());
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < n; i++) {
    covariance += (xs[i] - meanX) * (ys[i] - meanY);
    varianceX += (xs[i] - meanX) ** 2;
    varianceY += (ys[i] - meanY) ** 2;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
}

describe('RandomStream', () => {
  const seedKey = deriveSeedKey('kupfer-falke-731');

  describe('nextUint32', () => {
    it('implements sfc32', () => {
      expect(take(new RandomStream([1, 2, 3, 4]), 6)).toEqual([
        0x00000007, 0x00000022, 0x03600060, 0x0b421d78, 0xcc849c75, 0x17ce4c72,
      ]);
    });
  });

  describe('nextFloat32', () => {
    it('stays in [0, 1)', () => {
      const stream = createStream(seedKey, 'test/float32');
      const values = Array.from({ length: 10_000 }, () => stream.nextFloat32());
      expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
      expect(new RandomStream([0, 0, -1, 0]).nextFloat32()).toBeLessThan(1);
    });
  });

  describe('nextFloat53', () => {
    it('stays in [0, 1) with mean and variance of a uniform distribution', () => {
      const stream = createStream(seedKey, 'test/float53');
      const n = 100_000;
      let sum = 0;
      let sumSquares = 0;
      let min = 1;
      let max = 0;
      for (let i = 0; i < n; i++) {
        const value = stream.nextFloat53();
        sum += value;
        sumSquares += value * value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThan(1);
      const mean = sum / n;
      expect(mean).toBeCloseTo(0.5, 2);
      expect(sumSquares / n - mean * mean).toBeCloseTo(1 / 12, 2);
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
    for (const neighbour of neighbours) {
      expect(Math.abs(correlation(base, floats(neighbour)))).toBeLessThan(0.03);
    }
  });

  it('produces distinct first outputs across many keys', () => {
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
    const family = new StreamFamily(seedKey, 'market/instrument/cmp-0001/');
    for (const day of [0, 7, 10, 999, 2610, 123_456_789]) {
      expect(take(family.create(day), 8)).toEqual(
        take(createStream(seedKey, `market/instrument/cmp-0001/${day}`), 8),
      );
    }
  });

  it('rejects negative and fractional suffixes', () => {
    const family = new StreamFamily(seedKey, 'market/regime/');
    expect(() => family.create(-1)).toThrow(RangeError);
    expect(() => family.create(1.5)).toThrow(RangeError);
  });
});
