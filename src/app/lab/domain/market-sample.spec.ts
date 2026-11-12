import { dayIndex, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { createCurveTables } from '@app/market/domain/day-curve';
import { MarketContext } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { runPrehistory } from '@app/market/domain/prehistory';
import { indexSeries, totalReturnSeries } from '@app/market/domain/series';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { LabSimulation } from './lab-simulation';
import { collectMarketSample, MarketSample } from './market-sample';

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
