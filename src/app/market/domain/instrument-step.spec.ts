import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { stepInstrument } from './instrument-step';
import { createMarketContext } from './market-context';
import { advanceMarket, createMarketDay, createMarketState } from './market-step';

import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

const seedKey = deriveSeedKey('golden-1');
const context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);

describe('stepInstrument', () => {
  it('depends only on the day, the previous close and the factor levels', () => {
    const first = createMarketDay(context.layout);
    const second = createMarketDay(context.layout);
    second.jumpTotal = 5;
    const close = stepInstrument(context, 42, 100, 0.3, first);
    expect(stepInstrument(context, 42, 100, 0.3, second)).toBe(close);
    expect(second.logOpen[42]).toBe(first.logOpen[42]);
    expect(second.jumpCount[42]).toBe(first.jumpCount[42]);
    expect(second.jumpStart[42]).toBe(5);
  });

  it('includes the jumps of the day in the close', () => {
    const day = createMarketDay(context.layout);
    let found = false;
    for (let d = 0; d < 2000 && !found; d++) {
      day.jumpTotal = 0;
      stepInstrument(context, 0, d, 0, day);
      found = day.jumpCount[0] > 0;
    }
    expect(found).toBe(true);
  });

  it('gives the stocks plausible volatilities over five years', () => {
    const closes: number[][] = context.layout.instrumentIds.map(() => []);
    advanceMarket(context, createMarketState(context), 1827, {
      onDay: (day) => day.logClose.forEach((close, i) => closes[i].push(close)),
    });
    const volatilities = closes
      .map((series) => {
        const returns = series.slice(1).map((close, n) => close - series[n]);
        const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
        const variance =
          returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
        return Math.sqrt(variance * DEFAULT_MARKET_CONFIG.tradingDaysPerYear);
      })
      .sort((a, b) => a - b);
    const median = volatilities[Math.floor(volatilities.length / 2)];
    expect(median).toBeGreaterThan(0.2);
    expect(median).toBeLessThan(0.6);
    expect(volatilities[0]).toBeGreaterThan(0.1);
  });
});
