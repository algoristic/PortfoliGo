import { mean, standardDeviation } from '@app/analysis/domain/statistics-logic';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { DIVIDENDS_PER_YEAR } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { stepInstrument } from './instrument-step';
import { isMarketDay } from './market-calendar';
import { createMarketContext } from './market-context';
import { createMarketDay, createMarketState } from './market-step';
import { MarketConfig } from './models/market-config.model';

import { TEST_SEEDS } from '../../../testing/seeds';
import { expectWithinSigma, meanSe } from '../../../testing/statistics';

// Expected path and return of the idiosyncratic part U_i (TS §6.4, E-22). The factors stay at 0
// and the companies pay no dividends, so U_i is the whole log price change. Oracles are the formulas
// of TS §6.4, written out here: v = σ² + λ·(μ_J² + σ_J²), h(t) = (1 − e^{−κ_α·t}) / κ_α,
// g(t) = (1 − e^{−2θt}) / (2θ).

const { tradingDaysPerYear } = DEFAULT_MARKET_CONFIG;

interface IdioSample {
  /** Years `t` of market days simulated. */
  years: number;
  alpha: number[];
  variance: number[];
  /** Expected log markdown of the dividends p. a., `−f·ln(1 − y/f)`; 0 without a dividend. */
  drag: number[];
  idio: number[];
}

function withoutDividends(world: World): World {
  return {
    ...world,
    companies: world.companies.map((company) => ({
      ...company,
      dividend: { yield: 0, frequency: null, schedule: null },
    })),
  };
}

/** U_i of all shares after `years` of day steps without factors, over several seeds. */
function simulateIdio(
  seeds: readonly string[],
  config: MarketConfig,
  years: number,
  dividends = false,
): IdioSample {
  const sample: IdioSample = { years: 0, alpha: [], variance: [], drag: [], idio: [] };
  for (const seed of seeds) {
    const seedKey = deriveSeedKey(seed);
    const world = generateWorld(seedKey);
    const context = createMarketContext(
      seedKey,
      dividends ? world : withoutDividends(world),
      config,
    );
    const { layout } = context;
    const state = createMarketState(context);
    const out = createMarketDay(context);
    const count = layout.instrumentIds.length;
    let marketDays = 0;
    for (let day = 0; marketDays < years * tradingDaysPerYear; day++) {
      if (!isMarketDay(day)) {
        continue;
      }
      out.jumpTotal = 0;
      for (let i = 0; i < count; i++) {
        stepInstrument(context, i, day, state, out);
      }
      marketDays++;
    }
    sample.years = marketDays / tradingDaysPerYear;
    for (let i = 0; i < count; i++) {
      const lambda = layout.jumpIntensity[i];
      sample.alpha.push(layout.alpha[i]);
      sample.variance.push(
        layout.idioVol[i] ** 2 + lambda * (layout.jumpMean[i] ** 2 + layout.jumpSd[i] ** 2),
      );
      const dividend = layout.dividends[i];
      const perYear = dividend === null ? 0 : DIVIDENDS_PER_YEAR[dividend.frequency];
      sample.drag.push(dividend === null ? 0 : -perYear * Math.log(1 - dividend.yield / perYear));
      sample.idio.push(state.idioClose[i]);
    }
  }
  return sample;
}

/** `(1 − e^{−r·t}) / r`, or `t` for `r = 0`. */
function weight(rate: number, years: number): number {
  return rate === 0 ? years : (1 - Math.exp(-rate * years)) / rate;
}

/** `e^{U_i − α_i·h(t)}`, whose expectation is 1 with the compensator. */
function growthRatios(sample: IdioSample, alphaDecay: number): number[] {
  const h = weight(alphaDecay, sample.years);
  return sample.idio.map((u, i) => Math.exp(u - sample.alpha[i] * h));
}

describe('idiosyncratic path', () => {
  describe('with permanent alpha and without return to the path (θ = κ_α = 0)', () => {
    let sample: IdioSample;

    beforeAll(() => {
      const config = { ...DEFAULT_MARKET_CONFIG, idioReversion: 0, alphaDecay: 0 };
      sample = simulateIdio(TEST_SEEDS.crossSection, config, 10);
    });

    it('compensates diffusion and jumps, so that E[e^U] grows with α only', () => {
      const ratios = growthRatios(sample, 0);
      expectWithinSigma(
        mean(ratios),
        1,
        meanSe(standardDeviation(ratios), ratios.length),
        4,
        'mean of e^(U − αt)',
      );
    });

    it('gives log U the drift α − ½·v', () => {
      const t = sample.years;
      const z = sample.idio.map(
        (u, i) =>
          (u - sample.alpha[i] * t + 0.5 * sample.variance[i] * t) /
          Math.sqrt(sample.variance[i] * t),
      );
      expectWithinSigma(mean(z), 0, meanSe(1, z.length), 4, 'standardised log drift');
    });
  });

  describe('with decaying alpha and return to the path', () => {
    const { idioReversion: theta, alphaDecay } = DEFAULT_MARKET_CONFIG;
    let sample: IdioSample;

    beforeAll(() => {
      sample = simulateIdio(TEST_SEEDS.crossSection.slice(0, 10), DEFAULT_MARKET_CONFIG, 40);
    });

    it('keeps the compensator', () => {
      const ratios = growthRatios(sample, alphaDecay);
      expectWithinSigma(
        mean(ratios),
        1,
        meanSe(standardDeviation(ratios), ratios.length),
        4,
        'mean of e^(U − α·h(t))',
      );
    });

    it('does not recover the dividend markdowns', () => {
      const withDividends = simulateIdio(
        TEST_SEEDS.crossSection.slice(0, 5),
        DEFAULT_MARKET_CONFIG,
        40,
        true,
      );
      const t = withDividends.years;
      const h = weight(alphaDecay, t);
      const ratios = withDividends.idio.flatMap((u, i) =>
        withDividends.drag[i] > 0
          ? [Math.exp(u - withDividends.alpha[i] * h + withDividends.drag[i] * t)]
          : [],
      );
      expect(ratios.length).toBeGreaterThan(100);
      expectWithinSigma(
        mean(ratios),
        1,
        meanSe(standardDeviation(ratios), ratios.length),
        4,
        'mean of e^(U − α·h(t) + ỹ·t) of the payers',
      );
    });

    it('bounds the deviation from the path by the stationary variance v / (2θ)', () => {
      const g = weight(2 * theta, sample.years);
      const h = weight(alphaDecay, sample.years);
      // Standardised deviation from m(t) = α·h(t) − ½·v·g(t); its variance is 1.
      const squares = sample.idio.map((u, i) => {
        const expected = sample.alpha[i] * h - 0.5 * sample.variance[i] * g;
        return (u - expected) ** 2 / (sample.variance[i] * g);
      });
      expect(g).toBeLessThan(1 / (2 * theta));
      expect(g).toBeLessThan(sample.years / 3);
      expectWithinSigma(
        mean(squares),
        1,
        meanSe(standardDeviation(squares), squares.length),
        4,
        'standardised variance',
      );
    });

    it('lets the alpha of a share fade, bounding its effect by α / κ_α', () => {
      // The cross-sectional slope of U on α is h(t) = (1 − e^{−κ_α·t}) / κ_α < 1 / κ_α.
      const n = sample.alpha.length;
      const meanAlpha = mean(sample.alpha);
      const meanIdio = mean(sample.idio);
      let covariance = 0;
      let variance = 0;
      for (let i = 0; i < n; i++) {
        covariance += (sample.alpha[i] - meanAlpha) * (sample.idio[i] - meanIdio);
        variance += (sample.alpha[i] - meanAlpha) ** 2;
      }
      const slope = covariance / variance;
      const residual = Math.sqrt(mean(sample.variance) * weight(2 * theta, sample.years));
      const se = residual / Math.sqrt(variance);
      expectWithinSigma(slope, weight(alphaDecay, sample.years), se, 4, 'slope of U on α');
    });
  });
});
