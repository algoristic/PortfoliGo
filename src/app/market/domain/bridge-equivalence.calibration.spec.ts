import { standardDeviation } from '@app/analysis/domain/statistics-logic';
import { deriveSeedKey } from '@app/simulation/util/seed';

import { World } from '@app/world/domain/models/world.model';

import { generateWorld } from '@app/world/domain/world-generator';

import { createCurveTables, DayCurves } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext } from './market-context';
import { advanceMarket, createMarketState } from './market-step';
import { ReferenceSimulation } from './reference-simulation';

const TRADING_DAYS = 3000;
const PROFILE_TRADING_DAYS = 1500;
const TRADING_DAYS_PER_YEAR = DEFAULT_MARKET_CONFIG.tradingDaysPerYear;
/** Heavier idiosyncratic variance at the open and towards the close (TS §6.1). */
const PROFILE = [3, 1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1.2, 1.5, 2.5];

/** Running statistics of the session curves of two instruments. */
class SessionStats {
  #minuteSquares = [0, 0];
  #minuteProduct = 0;
  #rangeSum = [0, 0];
  /** Squared minute returns per part of the session (`PROFILE.length` parts), both instruments. */
  readonly #partSquares = new Float64Array(PROFILE.length);
  readonly #sessionReturns: [number[], number[]] = [[], []];
  #days = 0;

  add(curves: readonly ArrayLike<number>[]): void {
    const [a, b] = curves;
    for (let j = 1; j < a.length; j++) {
      const ra = Math.log(a[j] / a[j - 1]);
      const rb = Math.log(b[j] / b[j - 1]);
      this.#minuteSquares[0] += ra * ra;
      this.#minuteSquares[1] += rb * rb;
      this.#partSquares[Math.floor(((j - 1) * PROFILE.length) / (a.length - 1))] +=
        ra * ra + rb * rb;
      this.#minuteProduct += ra * rb;
    }
    curves.forEach((curve, n) => {
      const prices = Array.from(curve);
      this.#rangeSum[n] += (Math.max(...prices) - Math.min(...prices)) / prices[0];
      this.#sessionReturns[n].push(Math.log(prices[prices.length - 1] / prices[0]));
    });
    this.#days++;
  }

  /** Volatility of the minute returns p. a. per instrument (mean taken as 0 within a day). */
  minuteVol(n: number): number {
    return Math.sqrt((this.#minuteSquares[n] / this.#days) * TRADING_DAYS_PER_YEAR);
  }

  correlation(): number {
    return this.#minuteProduct / Math.sqrt(this.#minuteSquares[0] * this.#minuteSquares[1]);
  }

  meanRange(n: number): number {
    return this.#rangeSum[n] / this.#days;
  }

  /** Volatility open → close p. a. */
  sessionVol(n: number): number {
    return standardDeviation(this.#sessionReturns[n]) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  /** Volatility per part of the session relative to the whole session. */
  partProfile(): number[] {
    const total = this.#partSquares.reduce((sum, value) => sum + value, 0);
    return Array.from(this.#partSquares, (value) => Math.sqrt((value / total) * PROFILE.length));
  }

  get days(): number {
    return this.#days;
  }
}

/** Runs the bridges and the reference side by side for two stocks of the same exchange. */
function compare(
  days: number,
  bridge: SessionStats,
  reference: SessionStats,
  profile: readonly number[],
): number {
  const seedKey = deriveSeedKey('bridge-equivalence-1');
  const generated = generateWorld(seedKey);
  // The reference compares the diffusion; jumps are left out (TS §4.6).
  const world: World = {
    ...generated,
    companies: generated.companies.map((company) => ({
      ...company,
      model: { ...company.model, jumpIntensity: 0 },
    })),
  };
  const context = createMarketContext(seedKey, world, {
    ...DEFAULT_MARKET_CONFIG,
    intradayVolProfile: profile,
  });
  const first = world.companies[0];
  const second = world.companies.findIndex(
    (company, i) => i > 0 && company.exchangeId === first.exchangeId,
  );
  const instruments = [0, second];
  const curves = new DayCurves(createCurveTables(context));
  const simulation = new ReferenceSimulation(context, instruments);
  const state = createMarketState(context);
  while (bridge.days < days) {
    advanceMarket(context, state, state.day + 1, {
      onDay: (day) => {
        curves.load(day);
        bridge.add(instruments.map((i) => curves.instrumentCurve(i)));
        reference.add(simulation.simulateDay(day, state.trend));
      },
    });
  }
  return second;
}

describe('bridge equivalence with the reference simulation', () => {
  let second: number;
  const bridge = new SessionStats();
  const reference = new SessionStats();

  beforeAll(() => {
    second = compare(TRADING_DAYS, bridge, reference, DEFAULT_MARKET_CONFIG.intradayVolProfile);
  });

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

  // Tolerances of TS §4.6 and §6.1: volatility ±3 %, daily range ±4 %, open → close ±6 %
  // (relative), correlation ±0.03.
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

describe('bridge equivalence with an intraday profile', () => {
  const bridge = new SessionStats();
  const reference = new SessionStats();

  beforeAll(() => {
    compare(PROFILE_TRADING_DAYS, bridge, reference, PROFILE);
  });

  // TS §6.1: the profile shapes the variance within the session; the reference follows it minute
  // by minute. Tolerance ±5 % per part (relative), the total stays as without the profile (±3 %).
  it('has the volatility of each part of the session', () => {
    const bridgeProfile = bridge.partProfile();
    const referenceProfile = reference.partProfile();
    bridgeProfile.forEach((value, part) => {
      expect(Math.abs(value / referenceProfile[part] - 1), `part ${part}`).toBeLessThan(0.05);
    });
    // The open part is clearly more volatile than the middle.
    expect(bridgeProfile[0]).toBeGreaterThan(1.2 * bridgeProfile[6]);
  });

  it('keeps the volatility of the minute returns', () => {
    for (const n of [0, 1]) {
      expect(Math.abs(bridge.minuteVol(n) / reference.minuteVol(n) - 1)).toBeLessThan(0.03);
    }
  });
});
