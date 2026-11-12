import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
} from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { createCurveTables } from '@app/market/domain/day-curve';
import { MarketContext } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { runPrehistory } from '@app/market/domain/prehistory';
import { PriceSource } from '@app/market/domain/price-source';
import { indexSeries, totalReturnSeries } from '@app/market/domain/series';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { LabSimulation } from './lab-simulation';
import { collectMarketSample, MarketSample, MarketSampleCollector } from './market-sample';

const SEED = 'market-sample-test';

describe('collectMarketSample', () => {
  const fromDay = dayIndex(GAME_START_TICK) - 60;
  const toDay = dayIndex(GAME_START_TICK);
  let world: World;
  let context: MarketContext;
  let history: FactorHistory;
  let sample: MarketSample;
  /** Independent path to the same daily candles: the support candles of the lab simulation. */
  let oracle: LabSimulation;

  beforeAll(() => {
    const seedKey = deriveSeedKey(SEED);
    world = generateWorld(seedKey);
    ({ context, history } = runPrehistory(seedKey, world));
    sample = collectMarketSample(createCurveTables(context), history, world, fromDay, toDay);
    oracle = new LabSimulation(SEED);
    oracle.runPrehistory();
  });

  it('collects every market day of the period with its phase', () => {
    const days: number[] = [];
    const phases: string[] = [];
    recomputeSupportDays(context, history, fromDay, toDay, (day) => {
      days.push(day.day);
      phases.push(day.phase);
    });
    expect(Array.from(sample.days)).toEqual(days);
    expect(Array.from(sample.phases, (p) => ['boom', 'normal', 'downturn', 'crisis'][p])).toEqual(
      phases,
    );
  });

  it('takes the closes of the world indices from the daily candles', () => {
    const x = world.indices.findIndex((index) => index.kind === 'world');
    const from = GAME_START_TICK - 60 * TICKS_PER_DAY;
    const price = oracle.supportCandles(indexSeries(context, x), '1d', from, oracle.now);
    const totalReturn = oracle.supportCandles(
      totalReturnSeries(context, x),
      '1d',
      from,
      oracle.now,
    );
    expect(Array.from(sample.worldPrice)).toEqual(price.map((candle) => candle.close));
    expect(Array.from(sample.worldTotalReturn)).toEqual(totalReturn.map((candle) => candle.close));
  });

  it('computes close-to-close log returns per share', () => {
    const from = GAME_START_TICK - 60 * TICKS_PER_DAY;
    for (const share of [0, 17]) {
      const closes = oracle.supportCandles(share, '1d', from, oracle.now).map((c) => c.close);
      const expected = closes.slice(1).map((close, d) => Math.fround(Math.log(close / closes[d])));
      expect(Array.from(sample.stockReturns[share])).toEqual(expected);
    }
  });
});

/** Sample variance (n − 1), independent of `statistics-logic`. */
function sampleVariance(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - m) * (b - m), 0) / (values.length - 1);
}

function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

describe('MarketSampleCollector', () => {
  // About 400 calendar days before the game start: more than a year of market days, so that the
  // checkpoint at the game start has its trailing index volatility.
  const fromDay = dayIndex(GAME_START_TICK) - 400;
  const toDay = dayIndex(GAME_START_TICK);
  const fromTick = dayStartTick(fromDay);
  let world: World;
  let context: MarketContext;
  let history: FactorHistory;
  let sample: MarketSample;
  let prices: PriceSource;
  let oracle: LabSimulation;

  beforeAll(() => {
    const seedKey = deriveSeedKey(SEED);
    world = generateWorld(seedKey);
    const market = runPrehistory(seedKey, world);
    context = market.context;
    history = market.history;
    sample = collectMarketSample(createCurveTables(context), history, world, fromDay, toDay);
    prices = new PriceSource(market.context, market.history, market.state);
    oracle = new LabSimulation(SEED);
    oracle.runPrehistory();
  });

  /** Overnight share from the daily candles of the support points. */
  function overnightShare(series: number): number {
    const candles = oracle.supportCandles(series, '1d', fromTick, oracle.now);
    const overnight = candles.slice(1).map((c, d) => Math.log(c.open / candles[d].close));
    const daily = candles.slice(1).map((c, d) => Math.log(c.close / candles[d].close));
    return sampleVariance(overnight) / sampleVariance(daily);
  }

  it('measures the overnight share of the world index, the regional indices and the shares', () => {
    const x = world.indices.findIndex((index) => index.kind === 'world');
    expect(sample.overnight.world).toBeCloseTo(overnightShare(indexSeries(context, x)), 9);
    const regions = world.indices.flatMap((index, r) =>
      index.kind === 'region-broad' ? [overnightShare(indexSeries(context, r))] : [],
    );
    expect(regions.length).toBeGreaterThan(1);
    expect(sample.overnight.regions).toBeCloseTo(middle(regions), 9);
    const shares = world.companies.map((_, i) => overnightShare(i));
    expect(sample.overnight.stocks).toBeCloseTo(middle(shares), 9);
  });

  it('records the market at the last close before the game start', () => {
    // The game starts on Monday, 01.04.2030 (TS §3.1): the checkpoint is Friday, 29.03.2030.
    const day = dayIndex(dateTimeToTick({ year: 2030, month: 3, day: 29 }));
    const close = dayStartTick(day + 1) - 1;
    const closes = world.companies.map((_, i) => prices.priceAt(i, close, oracle.now));
    const x = world.indices.findIndex((index) => index.kind === 'world');
    const { memberStart, members, shares } = context.indices;
    const weights: number[] = [];
    for (let m = memberStart[x]; m < memberStart[x + 1]; m++) {
      weights.push(shares[m] * closes[members[m]]);
    }
    weights.sort((a, b) => b - a);
    const total = weights.reduce((a, b) => a + b, 0);
    const smallCaps = world.companies.flatMap((company, i) =>
      company.size === 'small' ? [closes[i]] : [],
    );

    const [atStart, ...later] = sample.checkpoints;
    expect(atStart.years).toBe(0);
    expect(atStart.tick).toBe(dayStartTick(day));
    expect(atStart.topFiveShare).toBeCloseTo(
      weights.slice(0, 5).reduce((a, b) => a + b, 0) / total,
      12,
    );
    expect(atStart.belowOneEuro.all).toBe(closes.filter((c) => c < 1).length / closes.length);
    expect(atStart.belowOneEuro.small).toBe(
      smallCaps.filter((c) => c < 1).length / smallCaps.length,
    );
    expect(atStart.atFloor).toBe(closes.filter((c) => c <= 0.01).length / closes.length);
    expect(atStart.maxPrice).toBe(Math.max(...closes));

    const index = oracle
      .supportCandles(indexSeries(context, x), '1d', fromTick, oracle.now)
      .map((candle) => candle.close);
    // The checkpoint is the last day of the period: its 261 trailing returns.
    const trailing = index.slice(-262);
    const returns = trailing.slice(1).map((c, d) => Math.log(c / trailing[d]));
    expect(atStart.indexVolatility).toBeCloseTo(Math.sqrt(sampleVariance(returns) * 261), 12);

    // Later checkpoints lie after the period.
    expect(later.map((checkpoint) => checkpoint.years)).toEqual([10, 25, 50, 100]);
    expect(later.every((checkpoint) => checkpoint.tick === null)).toBe(true);
    expect(later.every((checkpoint) => Number.isNaN(checkpoint.topFiveShare))).toBe(true);
  });

  it('collects the same sample without the daily returns per share on request', () => {
    const collector = new MarketSampleCollector(createCurveTables(context), world, fromDay, toDay, {
      stockReturns: false,
      marketDaysPerYear: 261,
    });
    recomputeSupportDays(context, history, fromDay, toDay, (day) => collector.add(day));
    const lean = collector.finish();
    expect(lean.stockReturns).toEqual([]);
    expect(lean.worldTotalReturn).toEqual(sample.worldTotalReturn);
    expect(lean.overnight).toEqual(sample.overnight);
    expect(lean.checkpoints).toEqual(sample.checkpoints);
  });

  it('needs exactly the market days of the period', () => {
    const collector = new MarketSampleCollector(createCurveTables(context), world, fromDay, toDay, {
      marketDaysPerYear: 261,
    });
    recomputeSupportDays(context, history, fromDay, toDay - 7, (day) => collector.add(day));
    expect(() => collector.finish()).toThrow(/expected/);
  });
});
