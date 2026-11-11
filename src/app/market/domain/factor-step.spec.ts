import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { initialFactorState, stepPhase } from './factor-step';
import { createMarketContext } from './market-context';
import { advanceMarket, createMarketState } from './market-step';
import { MARKET_PHASES, MarketPhase } from './models/market-config.model';

import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

const seedKey = deriveSeedKey('golden-1');
const context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(variance / (values.length - 1));
}

describe('stepPhase', () => {
  it('visits every phase in a long chain', () => {
    const counts = new Map<MarketPhase, number>();
    let phase: MarketPhase = 'normal';
    const days = 200_000;
    for (let day = 0; day < days; day++) {
      phase = stepPhase(context, phase, day);
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    }
    for (const candidate of MARKET_PHASES) {
      const share = (counts.get(candidate) ?? 0) / days;
      expect(share).toBeGreaterThan(0.01);
      expect(share).toBeLessThan(0.7);
    }
  });

  it('keeps the phase on most days', () => {
    let changes = 0;
    for (let day = 0; day < 10_000; day++) {
      if (stepPhase(context, 'normal', day) !== 'normal') {
        changes++;
      }
    }
    const expected = 10_000 * context.phaseLeaveProbability[1];
    expect(Math.abs(changes - expected)).toBeLessThan(4 * Math.sqrt(expected));
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

describe('stepFactors', () => {
  it('gives the world factor a plausible return and volatility over ten years', () => {
    const boundaryCount = context.layout.boundaries.length;
    const returns: number[] = [];
    advanceMarket(context, createMarketState(context), 3653, {
      onDay: (day) => returns.push(day.factorLevels[boundaryCount - 1] - day.factorLevels[0]),
    });
    const years = returns.length / DEFAULT_MARKET_CONFIG.tradingDaysPerYear;
    const totalReturn = returns.reduce((sum, value) => sum + value, 0) / years;
    const volatility =
      standardDeviation(returns) * Math.sqrt(DEFAULT_MARKET_CONFIG.tradingDaysPerYear);
    expect(totalReturn).toBeGreaterThan(-0.05);
    expect(totalReturn).toBeLessThan(0.25);
    expect(volatility).toBeGreaterThan(0.1);
    expect(volatility).toBeLessThan(0.25);
  });
});
