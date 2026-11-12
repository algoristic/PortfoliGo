import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { initialFactorState, stepPhase } from './factor-step';
import { GOLDEN_SEED } from './golden-master';
import { createMarketContext, MarketContext } from './market-context';
import { MARKET_PHASES, MarketPhase } from './models/market-config.model';

import { binomialSe, expectWithinSigma } from '../../../testing/statistics';

const { phases, tradingDaysPerYear } = DEFAULT_MARKET_CONFIG;

let context: MarketContext;

beforeAll(() => {
  const seedKey = deriveSeedKey(GOLDEN_SEED);
  context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);
});

describe('stepPhase', () => {
  it('leaves a phase with the daily probability of its mean duration (TS §6.3)', () => {
    for (const phase of MARKET_PHASES) {
      // A phase of mean duration d years ends on a trading day with probability 1 / (d · 261).
      const p = 1 / (phases[phase].meanDuration * tradingDaysPerYear);
      const days = 20_000;
      let leaves = 0;
      for (let day = 0; day < days; day++) {
        leaves += stepPhase(context, phase, day) === phase ? 0 : 1;
      }
      expectWithinSigma(leaves / days, p, binomialSe(p, days), 5, phase);
    }
  });

  it('moves to the next phases by their configured weights', () => {
    const from: MarketPhase = 'normal';
    const counts = new Map<MarketPhase, number>();
    let leaves = 0;
    for (let day = 0; day < 200_000; day++) {
      const next = stepPhase(context, from, day);
      if (next !== from) {
        counts.set(next, (counts.get(next) ?? 0) + 1);
        leaves++;
      }
    }
    const weights = phases[from].next;
    const total = MARKET_PHASES.reduce((sum, phase) => sum + weights[phase], 0);
    expect(counts.get(from)).toBeUndefined();
    for (const next of MARKET_PHASES) {
      const p = weights[next] / total;
      expectWithinSigma((counts.get(next) ?? 0) / leaves, p, binomialSe(p, leaves), 5, next);
    }
  });
});

describe('initialFactorState', () => {
  it('starts flat in the reference phase', () => {
    const state = initialFactorState(context);
    expect(state.phase).toBe(DEFAULT_MARKET_CONFIG.referencePhase);
    expect(Array.from(state.level).every((level) => level === 0)).toBe(true);
    expect(state.trend[0]).toBeGreaterThan(0);
    expect(Math.exp(state.logVol[0])).toBeGreaterThan(0.05);
    expect(Math.exp(state.logVol[0])).toBeLessThan(0.5);
  });
});
