import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { MINI_START_CONDITIONS } from '@app/engine/domain/testing/mini-game';
import { intradayCandleBlock, supportOpenClose } from '@app/market/domain/chart-candles';
import { createCurveTables } from '@app/market/domain/day-curve';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { PriceSource } from '@app/market/domain/price-source';
import { indexSeries } from '@app/market/domain/series';
import { goldenYear } from '@app/market/domain/testing/golden-year';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { dailyCandleBlock, DailyCandleQuery } from './daily-candle-query';
import { candleYear, createCandleValues, patchCandleValues } from './daily-candles.utils';
import { DailyCandleBucket } from './engine-host.model';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../../testing/perf';

// Candle query of AP 4.1 (TS §8.2, §14.3) on the standard world: the minute chart of any past day
// with cold caches below 50 ms – for a share and for an index, whose day needs the minute curves of
// all shares – and five years of daily candles, from the stored candles or, before the background
// job, from the support points (never from minute curves).

const STOCK = 42;
const NOW = dateTimeToTick({ year: 2030, month: 6, day: 12, hour: 12 });

describe('candle query performance', () => {
  describe('minute chart of a past day', () => {
    it.each([
      ['a share', () => STOCK],
      ['an index', () => indexSeries(goldenYear().context, 0)],
    ])('answers the minute chart of a %s with cold caches within the budget', (label, seriesOf) => {
      const { context, history, state, endOfToday } = goldenYear();
      const series = seriesOf();
      const from = dateTimeToTick({ year: 2020, month: 6, day: 30 });
      const sources = Array.from({ length: 6 }, () => new PriceSource(context, history, state));
      let next = 0;
      let count = 0;
      const ms = medianMs(() => {
        count = intradayCandleBlock(
          sources[next++],
          series,
          '1m',
          { from, to: from + TICKS_PER_DAY - 1, limit: 2_000 },
          endOfToday,
        ).candles.length;
      }, 5);
      expect(count).toBeGreaterThan(300);
      expectWithinBudget(`candle query, minute chart of ${label}`, ms, BUDGETS_MS.minuteChart);
    });

    it('answers the longest hourly block of an index', () => {
      const { context, history, state, endOfToday } = goldenYear();
      const ms = medianMs(() => {
        intradayCandleBlock(
          new PriceSource(context, history, state),
          indexSeries(context, 0),
          '1h',
          { from: null, to: endOfToday, limit: 2_000 },
          endOfToday,
        );
      }, 3);
      console.info(`candle query, 23 days hourly of an index: ${ms.toFixed(1)} ms`);
    });
  });

  describe('five years of daily candles', () => {
    let engine: GameEngine;
    let history: FactorHistory;

    beforeAll(() => {
      const seedKey = deriveSeedKey('perf-candles');
      const world = createGameWorld(seedKey, generateWorld(seedKey));
      engine = GameEngine.start(world, MINI_START_CONDITIONS);
      engine.runUntil(NOW);
      history = { monthStarts: [...engine.monthStartsAfter(-1)] };
    });

    function query(series: number, buckets: DailyCandleBucket[]): DailyCandleQuery {
      const { context } = engine.world;
      const tables = createCurveTables(context);
      return {
        series,
        seriesId: 'perf',
        resolution: '1d',
        from: NOW - 5 * 365 * TICKS_PER_DAY,
        to: undefined,
        limit: 2_000,
        now: NOW,
        prices: engine.prices as PriceSource,
        loadBuckets: () => Promise.resolve(buckets),
        pending: [],
        support: (days) => supportOpenClose(context, history, tables, series, days),
      };
    }

    async function medianAsyncMs(run: () => Promise<unknown>, runs: number): Promise<number> {
      await run();
      const times: number[] = [];
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        await run();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return times[Math.floor(times.length / 2)];
    }

    it.each([
      ['a share', () => STOCK],
      ['an index', () => indexSeries(engine.world.context, 0)],
    ])(
      'answers five years of a %s from the support points and from storage',
      async (label, seriesOf) => {
        const series = seriesOf();
        const fallback = await dailyCandleBlock(query(series, []));
        expect(fallback.candles.length).toBeGreaterThan(1_250);
        const fromSupport = await medianAsyncMs(() => dailyCandleBlock(query(series, [])), 3);
        console.info(
          `candle query, 5 years daily of ${label} from support: ${fromSupport.toFixed(1)} ms`,
        );

        const buckets = new Map<number, DailyCandleBucket>();
        for (const candle of fallback.candles) {
          const day = dayIndex(candle.tick);
          if (day >= dayIndex(NOW)) {
            continue;
          }
          const year = candleYear(day);
          let bucket = buckets.get(year);
          if (bucket === undefined) {
            bucket = { seriesId: 'perf', year, values: createCandleValues(year) };
            buckets.set(year, bucket);
          }
          patchCandleValues(bucket.values, { seriesId: 'perf', day, ...candle });
        }
        const stored = [...buckets.values()].sort((a, b) => a.year - b.year);
        const fromStorage = await medianAsyncMs(() => dailyCandleBlock(query(series, stored)), 9);
        console.info(
          `candle query, 5 years daily of ${label} from storage: ${fromStorage.toFixed(1)} ms`,
        );
      },
    );
  });
});
