import { createCurveTables, DayCurves } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext } from './market-context';
import { advanceMarket, createMarketState } from './market-step';
import { ReferenceSimulation } from './testing/reference-simulation';

import { deriveSeedKey } from '../../simulation/util/seed';
import { World } from '../../world/domain/models/world.model';
import { generateWorld } from '../../world/domain/world-generator';

const TRADING_DAYS = 3000;

/** Running statistics of the session curves of two instruments. */
class SessionStats {
  #minuteSquares = [0, 0];
  #minuteProduct = 0;
  #minuteCount = 0;
  #rangeSum = [0, 0];
  #sessionSquares = [0, 0];
  #sessionSum = [0, 0];
  #days = 0;

  add(curves: readonly ArrayLike<number>[]): void {
    const [a, b] = curves;
    for (let j = 1; j < a.length; j++) {
      const ra = Math.log(a[j] / a[j - 1]);
      const rb = Math.log(b[j] / b[j - 1]);
      this.#minuteSquares[0] += ra * ra;
      this.#minuteSquares[1] += rb * rb;
      this.#minuteProduct += ra * rb;
      this.#minuteCount++;
    }
    curves.forEach((curve, n) => {
      const prices = Array.from(curve);
      this.#rangeSum[n] += (Math.max(...prices) - Math.min(...prices)) / prices[0];
      const session = Math.log(prices[prices.length - 1] / prices[0]);
      this.#sessionSum[n] += session;
      this.#sessionSquares[n] += session * session;
    });
    this.#days++;
  }

  /** Volatility of the minute returns p. a. per instrument. */
  minuteVol(n: number): number {
    return Math.sqrt((this.#minuteSquares[n] / this.#days) * 261);
  }

  correlation(): number {
    return this.#minuteProduct / Math.sqrt(this.#minuteSquares[0] * this.#minuteSquares[1]);
  }

  meanRange(n: number): number {
    return this.#rangeSum[n] / this.#days;
  }

  /** Volatility open → close p. a. */
  sessionVol(n: number): number {
    const mean = this.#sessionSum[n] / this.#days;
    return Math.sqrt((this.#sessionSquares[n] / this.#days - mean * mean) * 261);
  }

  get days(): number {
    return this.#days;
  }
}

describe('bridge equivalence with the reference simulation', () => {
  const seedKey = deriveSeedKey('bridge-equivalence-1');
  const generated = generateWorld(seedKey);
  const world: World = {
    ...generated,
    companies: generated.companies.map((company) => ({
      ...company,
      model: { ...company.model, jumpIntensity: 0 },
    })),
  };
  const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
  const first = world.companies[0];
  const second = world.companies.findIndex(
    (company, i) => i > 0 && company.exchangeId === first.exchangeId,
  );
  const instruments = [0, second];
  const bridge = new SessionStats();
  const reference = new SessionStats();

  const curves = new DayCurves(createCurveTables(context));
  const simulation = new ReferenceSimulation(context, instruments);
  const state = createMarketState(context);
  while (bridge.days < TRADING_DAYS) {
    advanceMarket(context, state, state.day + 1, {
      onDay: (day) => {
        curves.load(day);
        bridge.add(instruments.map((i) => curves.instrumentCurve(i)));
        reference.add(simulation.simulateDay(day, state.trend));
      },
    });
  }

  it('compares at least 3,000 trading days of two stocks of the same exchange', () => {
    expect(second).toBeGreaterThan(0);
    expect(bridge.days).toBe(TRADING_DAYS);
    console.info(
      [0, 1]
        .map(
          (n) =>
            `stock ${n}: minute vol ${bridge.minuteVol(n).toFixed(4)} / ${reference.minuteVol(n).toFixed(4)}, ` +
            `range ${bridge.meanRange(n).toFixed(4)} / ${reference.meanRange(n).toFixed(4)}, ` +
            `open→close vol ${bridge.sessionVol(n).toFixed(4)} / ${reference.sessionVol(n).toFixed(4)}`,
        )
        .join('\n') +
        `\ncorrelation ${bridge.correlation().toFixed(4)} / ${reference.correlation().toFixed(4)}`,
    );
  });

  it('has the volatility of the minute returns', () => {
    for (const n of [0, 1]) {
      expect(Math.abs(bridge.minuteVol(n) / reference.minuteVol(n) - 1)).toBeLessThan(0.03);
    }
  });

  it('has the correlation of the minute returns', () => {
    expect(Math.abs(bridge.correlation() - reference.correlation())).toBeLessThan(0.03);
  });

  it('has the daily range', () => {
    for (const n of [0, 1]) {
      expect(Math.abs(bridge.meanRange(n) / reference.meanRange(n) - 1)).toBeLessThan(0.04);
    }
  });

  it('has the volatility from open to close', () => {
    for (const n of [0, 1]) {
      expect(Math.abs(bridge.sessionVol(n) / reference.sessionVol(n) - 1)).toBeLessThan(0.06);
    }
  });
});
