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

// Expected path and return of the idiosyncratic part U_i (TS §6.4, §6.5; E-22, E-32, E-33). The
// factors stay at 0, so U_i is the whole log price change. Oracles are the formulas of TS §6.4 and
// §6.5, written out here: v = σ² + λ·(μ_J² + σ_J²), h(t) = (1 − e^{−κ_α·t}) / κ_α,
// g(t) = (1 − e^{−2θt}) / (2θ), zero-beta drift z = (1 − β)·r_z, dividend markdown
// D(d) = ỹ_∞·d + (ỹ_0 − ỹ_∞)·(1 − e^{−κ_y·d}) / κ_y with ỹ = −f·ln(1 − y/f).

const { tradingDaysPerYear } = DEFAULT_MARKET_CONFIG;

interface IdioSample {
  /** Years `t` of market days simulated. */
  years: number;
  alpha: number[];
  /** Zero-beta drift `(1 − β)·r_z` p. a. */
  zeroBeta: number[];
  variance: number[];
  /** Expected log markdown of the dividends paid so far, `D(t − t_0)`; 0 without a dividend. */
  markdown: number[];
  /** Log markdowns `ln(P / (P − D))` of the ex-dates so far. */
  paid: number[];
  /** Target yield at the epoch; 0 for companies that start to pay later. */
  startYield: number[];
  /** Expected log markdown of one payment at the end, `ỹ(t − t_0) / f`; 0 without a dividend. */
  lastPayment: number[];
  idio: number[];
}

function withoutDividends(world: World): World {
  return {
    ...world,
    companies: world.companies.map((company) => ({
      ...company,
      dividend: { ...company.dividend, yield: 0, schedule: null },
    })),
  };
}

/** `−f·ln(1 − y/f)`. */
function drag(dividendYield: number, perYear: number): number {
  return -perYear * Math.log(1 - dividendYield / perYear);
}

/** U_i of all shares after `years` of day steps without factors, over several seeds. */
function simulateIdio(
  seeds: readonly string[],
  config: MarketConfig,
  years: number,
  dividends = false,
): IdioSample {
  const sample: IdioSample = {
    years: 0,
    alpha: [],
    zeroBeta: [],
    variance: [],
    markdown: [],
    paid: [],
    startYield: [],
    lastPayment: [],
    idio: [],
  };
  const { longRunYield, yieldReversion, initialYield } = config.dividendLifecycle;
  for (const seed of seeds) {
    const seedKey = deriveSeedKey(seed);
    const generated = generateWorld(seedKey);
    const world = dividends ? generated : withoutDividends(generated);
    const context = createMarketContext(seedKey, world, config);
    const { layout } = context;
    const state = createMarketState(context);
    const out = createMarketDay(context);
    const count = layout.instrumentIds.length;
    const paid = new Float64Array(count);
    // Market days before each calendar day, counted here for the start of the payments.
    const marketDaysBeforeDay: number[] = [];
    let marketDays = 0;
    for (let day = 0; marketDays < years * tradingDaysPerYear; day++) {
      marketDaysBeforeDay.push(marketDays);
      if (!isMarketDay(day)) {
        continue;
      }
      out.jumpTotal = 0;
      for (let i = 0; i < count; i++) {
        stepInstrument(context, i, day, state, out);
        const cents = out.exDividendCents[i];
        if (cents > 0) {
          // Without factors the open after the markdown is e^(c + U); before it, D more.
          const after = Math.exp(out.logOpen[i]);
          paid[i] += Math.log((after + cents / 100) / after);
        }
      }
      marketDays++;
    }
    const t = marketDays / tradingDaysPerYear;
    sample.years = t;
    world.companies.forEach((company, i) => {
      const { model, dividend } = company;
      sample.alpha.push(model.alpha);
      sample.zeroBeta.push((1 - model.loadings.world) * config.zeroBetaReturn);
      sample.variance.push(
        model.idioVol ** 2 + model.jumpIntensity * (model.jumpMean ** 2 + model.jumpSd ** 2),
      );
      let markdown = 0;
      let lastPayment = 0;
      if (dividend.schedule !== null && dividend.startDay < marketDaysBeforeDay.length) {
        const perYear = DIVIDENDS_PER_YEAR[dividend.frequency];
        const start = drag(dividend.yield > 0 ? dividend.yield : initialYield, perYear);
        const longRun = drag(longRunYield, perYear);
        const d = t - marketDaysBeforeDay[dividend.startDay] / tradingDaysPerYear;
        markdown =
          longRun * d + ((start - longRun) * (1 - Math.exp(-yieldReversion * d))) / yieldReversion;
        lastPayment = (longRun + (start - longRun) * Math.exp(-yieldReversion * d)) / perYear;
      }
      sample.markdown.push(markdown);
      sample.lastPayment.push(lastPayment);
      sample.paid.push(paid[i]);
      sample.startYield.push(dividend.yield);
      sample.idio.push(state.idioClose[i]);
    });
  }
  return sample;
}

/** `(1 − e^{−r·t}) / r`, or `t` for `r = 0`. */
function weight(rate: number, years: number): number {
  return rate === 0 ? years : (1 - Math.exp(-rate * years)) / rate;
}

/** `e^{U_i − α_i·h(t) − z_i·t}`, whose expectation is 1 with the compensator. */
function growthRatios(sample: IdioSample, alphaDecay: number): number[] {
  const h = weight(alphaDecay, sample.years);
  return sample.idio.map((u, i) =>
    Math.exp(u - sample.alpha[i] * h - sample.zeroBeta[i] * sample.years),
  );
}

describe('idiosyncratic path', () => {
  describe('with permanent alpha and without return to the path (θ = κ_α = 0)', () => {
    let sample: IdioSample;

    beforeAll(() => {
      const config = { ...DEFAULT_MARKET_CONFIG, idioReversion: 0, alphaDecay: 0 };
      sample = simulateIdio(TEST_SEEDS.crossSection, config, 10);
    });

    it('compensates diffusion and jumps, so that E[e^U] grows with α and the zero-beta drift only', () => {
      const ratios = growthRatios(sample, 0);
      expectWithinSigma(
        mean(ratios),
        1,
        meanSe(standardDeviation(ratios), ratios.length),
        4,
        'mean of e^(U − αt − zt)',
      );
    });

    it('gives log U the drift α + (1 − β)·r_z − ½·v', () => {
      const t = sample.years;
      const z = sample.idio.map(
        (u, i) =>
          (u - (sample.alpha[i] + sample.zeroBeta[i]) * t + 0.5 * sample.variance[i] * t) /
          Math.sqrt(sample.variance[i] * t),
      );
      expectWithinSigma(mean(z), 0, meanSe(1, z.length), 4, 'standardised log drift');
    });

    it('lets the world beta shift the log path by (1 − β)·r_z per year', () => {
      // Regression through the origin of the standardised drift without the zero-beta part on
      // x = (1 − β)·t / √(v·t): its slope is r_z, with standard error 1 / √Σx².
      const t = sample.years;
      let xy = 0;
      let xx = 0;
      sample.idio.forEach((u, i) => {
        const scale = Math.sqrt(sample.variance[i] * t);
        const y = (u - sample.alpha[i] * t + 0.5 * sample.variance[i] * t) / scale;
        const x = (sample.zeroBeta[i] / DEFAULT_MARKET_CONFIG.zeroBetaReturn) * (t / scale);
        xy += x * y;
        xx += x * x;
      });
      expectWithinSigma(
        xy / xx,
        DEFAULT_MARKET_CONFIG.zeroBetaReturn,
        1 / Math.sqrt(xx),
        4,
        'slope on (1 − β)',
      );
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
        'mean of e^(U − α·h(t) − zt)',
      );
    });

    it('bounds the deviation from the path by the stationary variance v / (2θ)', () => {
      const g = weight(2 * theta, sample.years);
      const h = weight(alphaDecay, sample.years);
      // Standardised deviation from m(t) = α·h(t) + z·t − ½·v·g(t); its variance is 1.
      const squares = sample.idio.map((u, i) => {
        const expected =
          sample.alpha[i] * h + sample.zeroBeta[i] * sample.years - 0.5 * sample.variance[i] * g;
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
      const withoutZeroBeta = sample.idio.map((u, i) => u - sample.zeroBeta[i] * sample.years);
      const meanAlpha = mean(sample.alpha);
      const meanIdio = mean(withoutZeroBeta);
      let covariance = 0;
      let variance = 0;
      for (let i = 0; i < n; i++) {
        covariance += (sample.alpha[i] - meanAlpha) * (withoutZeroBeta[i] - meanIdio);
        variance += (sample.alpha[i] - meanAlpha) ** 2;
      }
      const slope = covariance / variance;
      const residual = Math.sqrt(mean(sample.variance) * weight(2 * theta, sample.years));
      const se = residual / Math.sqrt(variance);
      expectWithinSigma(slope, weight(alphaDecay, sample.years), se, 4, 'slope of U on α');
    });
  });

  describe('with the dividend lifecycle (E-33)', () => {
    const { alphaDecay } = DEFAULT_MARKET_CONFIG;
    const { longRunYield } = DEFAULT_MARKET_CONFIG.dividendLifecycle;
    let sample: IdioSample;
    /** Payers since the epoch above and below the long-run yield, and later payers. */
    let groups: { name: string; members: number[] }[];

    beforeAll(() => {
      sample = simulateIdio(TEST_SEEDS.crossSection.slice(0, 5), DEFAULT_MARKET_CONFIG, 40, true);
      const indices = sample.markdown.map((_, i) => i);
      groups = [
        {
          name: 'start yield above the long-run yield',
          members: indices.filter((i) => sample.startYield[i] > longRunYield),
        },
        {
          name: 'start yield below the long-run yield',
          members: indices.filter(
            (i) => sample.startYield[i] > 0 && sample.startYield[i] < longRunYield,
          ),
        },
        {
          name: 'later payers',
          members: indices.filter((i) => sample.startYield[i] === 0 && sample.markdown[i] > 0.05),
        },
      ];
    });

    it('pays the log markdowns D(t − t_0) of the moving target yields', () => {
      for (const { name, members } of groups) {
        expect(members.length).toBeGreaterThan(30);
        const ratios = members.map((i) => sample.paid[i] / sample.markdown[i]);
        console.log(
          'PAID',
          name,
          members.length,
          mean(ratios),
          standardDeviation(ratios) / Math.sqrt(ratios.length),
        );
        expectWithinSigma(
          mean(ratios),
          1,
          meanSe(standardDeviation(ratios), ratios.length),
          4,
          `paid ÷ D, ${name}`,
        );
      }
    });

    it('does not recover the dividend markdowns', () => {
      const t = sample.years;
      const h = weight(alphaDecay, t);
      for (const { name, members } of groups) {
        const ratios = members.map((i) =>
          Math.exp(
            sample.idio[i] - sample.alpha[i] * h - sample.zeroBeta[i] * t + sample.markdown[i],
          ),
        );
        console.log(
          'RECOVER',
          name,
          members.length,
          mean(ratios),
          standardDeviation(ratios) / Math.sqrt(ratios.length),
        );
        expectWithinSigma(
          mean(ratios),
          1,
          meanSe(standardDeviation(ratios), ratios.length),
          4,
          `mean of e^(U − α·h(t) − zt + D), ${name}`,
        );
      }
    });
  });
});
