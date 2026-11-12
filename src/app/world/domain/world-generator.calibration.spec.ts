import { deriveSeedKey } from '@app/simulation/util/seed';

import { freeFloatMarketCap } from './company-generator';
import { DEFAULT_WORLD_CONFIG } from './default-world-config';
import { Company } from './models/company.model';
import { World } from './models/world.model';
import { generateWorld } from './world-generator';

import { binomialSe, expectWithinSigma } from '../../../testing/statistics';

// Statistical mix of the standard world over 20 seeds (TS §5.4, §5.6). Shares that follow
// directly from the configuration are compared with their expectation; the rest are plausibility
// bands until the calibration in AP 1.9.

const SEEDS = Array.from({ length: 20 }, (_value, index) => `world-calibration-${index}`);
const config = DEFAULT_WORLD_CONFIG;

function share<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length / items.length;
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Probability of `[low, high)` for the lognormal market cap drawn inside its bounds. */
function marketCapProbability(low: number, high: number): number {
  const { median, sigma, min, max } = config.companies.marketCap;
  const cdf = (euros: number): number =>
    normalCdf((Math.log(Math.min(max, Math.max(min, euros))) - Math.log(median)) / sigma);
  return (cdf(high) - cdf(low)) / (cdf(max) - cdf(min));
}

describe('generateWorld (calibration)', () => {
  let worlds: World[];
  let companies: Company[];

  beforeAll(() => {
    worlds = SEEDS.map((seed) => generateWorld(deriveSeedKey(seed)));
    companies = worlds.flatMap((world) => world.companies);
  });

  it('draws the size classes with the probabilities of the market cap distribution', () => {
    const { large, mid } = config.companies.sizeThresholds;
    const expected = {
      large: marketCapProbability(large, Number.POSITIVE_INFINITY),
      mid: marketCapProbability(mid, large),
      small: marketCapProbability(0, mid),
    };
    for (const size of ['large', 'mid', 'small'] as const) {
      expectWithinSigma(
        share(companies, (company) => company.size === size),
        expected[size],
        binomialSe(expected[size], companies.length),
        5,
        `${size} caps`,
      );
    }
  });

  it('makes ETFs distributing with the share of their products', () => {
    const { products } = config.etfs;
    const perWorld = products.reduce((sum, product) => sum + product.count, 0);
    const expected =
      products.reduce((sum, product) => sum + product.count * product.distributingShare, 0) /
      perWorld;
    const variance = products.reduce(
      (sum, p) => sum + p.count * p.distributingShare * (1 - p.distributingShare),
      0,
    );
    const etfs = worlds.flatMap((world) => world.etfs);
    expectWithinSigma(
      share(etfs, (etf) => etf.distribution.kind === 'distributing'),
      expected,
      Math.sqrt(variance * worlds.length) / etfs.length,
      5,
      'distributing ETFs',
    );
  });

  it('mixes styles, cyclicalities and risk classes', () => {
    for (const style of ['value', 'blend', 'growth']) {
      expect(share(companies, (company) => company.style === style)).toBeGreaterThan(0.15);
    }
    for (const cyclicality of ['defensive', 'neutral', 'cyclical']) {
      expect(share(companies, (c) => c.cyclicality === cyclicality)).toBeGreaterThan(0.15);
    }
    for (const riskClass of [1, 2, 3, 4, 5]) {
      expect(share(companies, (c) => c.riskClass === riskClass)).toBeGreaterThan(0.02);
    }
  });

  it('gives the world index a dividend yield of about 2–3 % and leaves some companies without', () => {
    for (const world of worlds) {
      let weighted = 0;
      let total = 0;
      for (const company of world.companies) {
        weighted += freeFloatMarketCap(company) * company.dividend.yield;
        total += freeFloatMarketCap(company);
      }
      expect(weighted / total).toBeGreaterThan(0.015);
      expect(weighted / total).toBeLessThan(0.035);
    }
    expect(share(companies, (company) => company.dividend.yield === 0)).toBeGreaterThan(0.1);
  });
});
