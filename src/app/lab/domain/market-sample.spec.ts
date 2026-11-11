import { LabSimulation } from './lab-simulation';
import { collectMarketSample } from './market-sample';

import { dayIndex, GAME_START_TICK } from '../../clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '../../clock/domain/models/time.model';
import { createCurveTables } from '../../market/domain/day-curve';
import { recomputeSupportDays } from '../../market/domain/market-history';
import { runPrehistory } from '../../market/domain/prehistory';
import { indexSeries, totalReturnSeries } from '../../market/domain/series';
import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

const SEED = 'market-sample-test';

describe('collectMarketSample', () => {
  const seedKey = deriveSeedKey(SEED);
  const world = generateWorld(seedKey);
  const { context, history } = runPrehistory(seedKey, world);
  const tables = createCurveTables(context);
  const fromDay = dayIndex(GAME_START_TICK) - 60;
  const toDay = dayIndex(GAME_START_TICK);
  const sample = collectMarketSample(tables, history, world, fromDay, toDay);
  const oracle = new LabSimulation(SEED);
  oracle.runPrehistory();

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
