import { standardDeviation } from '@app/analysis/domain/statistics-logic';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { createCurveTables, SupportValues } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { stepPhase } from './factor-step';
import { createMarketContext, MarketContext } from './market-context';
import { copyMarketDay } from './market-step';
import { MARKET_PHASES, MarketPhase } from './models/market-config.model';
import { MarketDay } from './models/market-day.model';
import { MarketState } from './models/market-state.model';
import { runPrehistory } from './prehistory';
import { priceFromLog } from './price-logic';
import { etfSeries } from './series';

import { TEST_SEEDS } from '../../../testing/seeds';
import { expectWithinSigma } from '../../../testing/statistics';

// Statistical plausibility of the market model on fixed seeds (TS §6.9, §14.1): principled bands
// of single building blocks. The calibration targets themselves are asserted in
// `lab/domain/calibration-targets.calibration.spec.ts` (AP 1.9c).

const { phases, tradingDaysPerYear, priceFloor } = DEFAULT_MARKET_CONFIG;

/**
 * Share of time per phase in the long run, from the configuration alone: the stationary
 * distribution ν of the jump chain (next-phase weights) weighted with the mean durations.
 */
function stationaryPhaseShares(): Record<MarketPhase, number> {
  const jump = MARKET_PHASES.map((from) => {
    const total = MARKET_PHASES.reduce((sum, to) => sum + phases[from].next[to], 0);
    return MARKET_PHASES.map((to) => phases[from].next[to] / total);
  });
  let nu = MARKET_PHASES.map(() => 1 / MARKET_PHASES.length);
  for (let round = 0; round < 10_000; round++) {
    nu = MARKET_PHASES.map((_to, q) => nu.reduce((sum, weight, p) => sum + weight * jump[p][q], 0));
  }
  const time = MARKET_PHASES.map((phase, p) => nu[p] * phases[phase].meanDuration);
  const total = time.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(MARKET_PHASES.map((phase, p) => [phase, time[p] / total])) as Record<
    MarketPhase,
    number
  >;
}

interface SeedRun {
  world: World;
  context: MarketContext;
  state: MarketState;
  years: number;
  /** Daily log return of the world factor. */
  worldReturns: number[];
  /** Annualized volatility of the daily log returns per stock, ascending. */
  stockVolatilities: number[];
  /** Accumulating and distributing ETF on the same index. */
  pairs: [number, number][];
  /** Units of the distributing ETF per pair when every payout is reinvested at the open. */
  units: number[];
  lastDay: MarketDay;
}

/** Prehistory of a seed (epoch to game start, about ten years) with the collected samples. */
function runSeed(seed: string): SeedRun {
  const seedKey = deriveSeedKey(seed);
  const world = generateWorld(seedKey);
  const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
  const { layout, etfs } = context;
  const tables = createCurveTables(context);
  const boundaryCount = layout.boundaries.length;
  const pairs: [number, number][] = [];
  for (let a = 0; a < etfs.ids.length; a++) {
    for (let d = 0; d < etfs.ids.length; d++) {
      if (
        etfs.distributions[a] === null &&
        etfs.distributions[d] !== null &&
        etfs.indexOf[a] === etfs.indexOf[d]
      ) {
        pairs.push([a, d]);
      }
    }
  }
  const units = pairs.map(() => 1);
  const worldReturns: number[] = [];
  const stockReturns: number[][] = layout.instrumentIds.map(() => []);
  let previousClose: Float64Array | null = null;
  let lastDay: MarketDay | null = null;
  const { state } = runPrehistory(seedKey, world, DEFAULT_MARKET_CONFIG, (day) => {
    worldReturns.push(day.factorLevels[boundaryCount - 1] - day.factorLevels[0]);
    if (previousClose !== null) {
      for (let i = 0; i < stockReturns.length; i++) {
        stockReturns[i].push(day.logClose[i] - previousClose[i]);
      }
    }
    previousClose = day.logClose.slice();
    if (pairs.some(([, d]) => day.etfExCents[d] > 0)) {
      const support = new SupportValues(tables, day);
      pairs.forEach(([, d], n) => {
        const cents = day.etfExCents[d];
        if (cents > 0) {
          units[n] *= 1 + cents / 100 / support.value(etfSeries(context, d), 'open');
        }
      });
    }
    lastDay = day;
  });
  return {
    world,
    context,
    state,
    years: state.day / 365.25,
    worldReturns,
    stockVolatilities: stockReturns
      .map((returns) => standardDeviation(returns) * Math.sqrt(tradingDaysPerYear))
      .sort((a, b) => a - b),
    pairs,
    units,
    lastDay: copyMarketDay(lastDay as unknown as MarketDay),
  };
}

describe('market calibration', () => {
  describe('phases', () => {
    it('spend about 40 / 35 / 17 / 8 % of the time in boom, normal, downturn and crisis', () => {
      // Target shares of TS §6.3.
      const target: Record<MarketPhase, number> = {
        boom: 0.4,
        normal: 0.35,
        downturn: 0.17,
        crisis: 0.08,
      };
      const shares = stationaryPhaseShares();
      for (const phase of MARKET_PHASES) {
        expect(Math.abs(shares[phase] - target[phase]), phase).toBeLessThan(0.01);
      }
    });

    it('spend the time in the phases of the stationary distribution of the configured chain', () => {
      const { context } = runSeedContext();
      const expected = stationaryPhaseShares();
      // 20 batches of 10,000 trading days (about 38 years each) for batch-means standard errors.
      const batches = 20;
      const batchDays = 10_000;
      const shares = MARKET_PHASES.map(() => new Array<number>(batches).fill(0));
      let phase: MarketPhase = DEFAULT_MARKET_CONFIG.referencePhase;
      for (let b = 0; b < batches; b++) {
        for (let n = 0; n < batchDays; n++) {
          phase = stepPhase(context, phase, b * batchDays + n);
          shares[MARKET_PHASES.indexOf(phase)][b] += 1 / batchDays;
        }
      }
      MARKET_PHASES.forEach((candidate, p) => {
        const observed = shares[p].reduce((sum, share) => sum + share, 0) / batches;
        const se = standardDeviation(shares[p]) / Math.sqrt(batches);
        expectWithinSigma(observed, expected[candidate], se, 5, candidate);
      });
    });
  });

  describe.each(TEST_SEEDS.calibration)('prehistory of %s', (seed) => {
    let run: SeedRun;

    beforeAll(() => {
      run = runSeed(seed);
    });

    it('gives the world factor a plausible return and volatility', () => {
      // A ten-year mean has a standard error of about σ/√10 ≈ 5 %; the bands allow about three.
      const annualReturn = run.worldReturns.reduce((sum, value) => sum + value, 0) / run.years;
      const volatility = standardDeviation(run.worldReturns) * Math.sqrt(tradingDaysPerYear);
      expect(annualReturn).toBeGreaterThan(-0.05);
      expect(annualReturn).toBeLessThan(0.25);
      expect(volatility).toBeGreaterThan(0.1);
      expect(volatility).toBeLessThan(0.25);
    });

    it('gives the stocks plausible volatilities', () => {
      const volatilities = run.stockVolatilities;
      const median = volatilities[Math.floor(volatilities.length / 2)];
      expect(median).toBeGreaterThan(0.2);
      expect(median).toBeLessThan(0.6);
      expect(volatilities[0]).toBeGreaterThan(0.1);
    });

    it('takes off about the TER per year from the ETF scale k', () => {
      const { etfs } = run.context;
      for (let e = 0; e < etfs.ids.length; e++) {
        const drift = Math.log(run.state.etfScale[e] / etfs.initialScale[e]) / run.years;
        const sd = etfs.dailyTrackingSd[e] * Math.sqrt(tradingDaysPerYear);
        expectWithinSigma(drift, -etfs.ter[e], sd / Math.sqrt(run.years), 5, etfs.ids[e]);
      }
    });

    it('gives accumulating and distributing ETFs the same total return before costs', () => {
      const { context, pairs, units, lastDay, years } = run;
      expect(pairs.length).toBeGreaterThan(0);
      const support = new SupportValues(createCurveTables(context), lastDay);
      pairs.forEach(([a, d], n) => {
        const totalA = support.value(etfSeries(context, a), 'close') / lastDay.etfScale[a];
        const totalD =
          (units[n] * support.value(etfSeries(context, d), 'close')) / lastDay.etfScale[d];
        // The pot holds cash between the dividends and the payout: about 0.1–0.15 % p. a. cash drag
        // with annual payouts.
        expect(Math.abs(totalD / totalA - 1)).toBeLessThan(0.002 * years);
      });
    });

    it('grows the total return index faster by about the dividend yield', () => {
      const { world, context, state, years } = run;
      const { indices, layout } = context;
      const x = world.indices.findIndex((index) => index.kind === 'world');
      let weightedYield = 0;
      let weight = 0;
      for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
        const i = indices.members[n];
        const value = indices.shares[n] * priceFromLog(state.logClose[i], priceFloor);
        weightedYield += value * (layout.dividends[i]?.yield ?? 0);
        weight += value;
      }
      const reinvestYield = Math.log(state.indexReinvest[x]) / years;
      expect(reinvestYield).toBeGreaterThan(0.5 * (weightedYield / weight));
      expect(reinvestYield).toBeLessThan(1.5 * (weightedYield / weight));
    });
  });
});

/** Market context of the first calibration seed (the phase chain needs no prehistory). */
function runSeedContext(): { context: MarketContext } {
  const seedKey = deriveSeedKey(TEST_SEEDS.calibration[0]);
  return { context: createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG) };
}
