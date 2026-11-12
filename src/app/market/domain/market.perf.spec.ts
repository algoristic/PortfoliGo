import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { DayCurves } from './day-curve';
import { advanceMarket, createMarketState } from './market-step';
import { runPrehistory } from './prehistory';
import { PriceSource } from './price-source';
import { seriesCount } from './series';
import { END_OF_2020_DAY, GoldenYear, goldenYear } from './testing/golden-year';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../testing/perf';

// Budgets of TS §14.3 for the standard world; the perf suite runs one file after the other.

describe('market performance', () => {
  let golden: GoldenYear;

  beforeAll(() => {
    golden = goldenYear();
  });

  it('starts a game (world and prehistory) within the budget', () => {
    const seedKey = deriveSeedKey('perf-game-start');
    const ms = medianMs(() => runPrehistory(seedKey, generateWorld(seedKey)), 3);
    expectWithinBudget('game start (world + prehistory)', ms, BUDGETS_MS.gameStart);
  });

  it('steps one game year with all minute curves within the budget', () => {
    const { context, tables } = golden;
    const series = seriesCount(context);
    const curves = new DayCurves(tables);
    let tradingDays = 0;
    const ms = medianMs(
      () => {
        tradingDays = 0;
        advanceMarket(context, createMarketState(context), END_OF_2020_DAY, {
          onDay: (day) => {
            curves.load(day);
            for (let s = 0; s < series; s++) {
              curves.seriesCurve(s);
            }
            tradingDays++;
          },
        });
      },
      1,
      0,
    );
    // 2020 has 262 weekdays (no holidays in stage 1).
    expect(tradingDays).toBe(262);
    expectWithinBudget('one game year with all minute curves', ms, BUDGETS_MS.gameYearLive);
  });

  it('computes the minute chart of a past day with cold caches within the budget', () => {
    const { context, history, state, endOfToday } = golden;
    const day = dayIndex(dateTimeToTick({ year: 2020, month: 6, day: 30 }));
    const sources = Array.from({ length: 6 }, () => new PriceSource(context, history, state));
    let next = 0;
    let candleCount = 0;
    const ms = medianMs(() => {
      candleCount = sources[next++].candles(
        42,
        '1m',
        dayStartTick(day),
        dayStartTick(day + 1),
        endOfToday,
      ).length;
    }, 5);
    expect(candleCount).toBeGreaterThan(300);
    expectWithinBudget('minute chart of a past day (cold)', ms, BUDGETS_MS.minuteChart);
  });
});
