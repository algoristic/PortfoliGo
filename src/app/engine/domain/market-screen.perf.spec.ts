import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { DailyCloses } from '@app/market/domain/daily-closes';
import { createCurveTables } from '@app/market/domain/day-curve';
import { instrumentCatalog } from '@app/market/domain/instrument-catalog';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { marketMovers, ScreenerSources, screenInstruments } from './market-screen';
import { MINI_START_CONDITIONS } from './testing/mini-game';

import { expectWithinBudget, medianMs } from '../../../testing/perf';

// AP 4.1: one screener query in the worker over the standard world well below 50 ms; the cache of
// daily closes moves on by a few day steps per market day. The first query after loading steps
// about 13 months of market days for the trailing dividends.
const SCREENER_BUDGET_MS = 50;
const NOW = dateTimeToTick({ year: 2030, month: 6, day: 12, hour: 16 });

describe('market screen performance', () => {
  let engine: GameEngine;
  let catalog: Instrument[];
  let history: FactorHistory;

  beforeAll(() => {
    const seedKey = deriveSeedKey('perf-screener');
    const world = createGameWorld(seedKey, generateWorld(seedKey));
    engine = GameEngine.start(world, MINI_START_CONDITIONS);
    engine.runUntil(NOW + TICKS_PER_DAY);
    history = { monthStarts: [...engine.monthStartsAfter(-1)] };
    catalog = instrumentCatalog(world.world, world.context);
  });

  function sources(closes: DailyCloses): ScreenerSources {
    const { context } = engine.world;
    return { context, catalog, prices: engine.prices, closes };
  }

  function freshCloses(): DailyCloses {
    const { context } = engine.world;
    return new DailyCloses(context, history, createCurveTables(context));
  }

  it('answers the first screener query after loading', () => {
    const ms = medianMs(() => screenInstruments(sources(freshCloses()), {}, NOW), 3);
    console.info(`screener, cold cache: ${ms.toFixed(1)} ms`);
  });

  it('answers a screener query on a cached market day within the budget', () => {
    const closes = freshCloses();
    screenInstruments(sources(closes), {}, NOW - TICKS_PER_DAY);
    const ms = medianMs(
      () => screenInstruments(sources(closes), { sort: { key: 'y1', direction: 'desc' } }, NOW),
      9,
    );
    expectWithinBudget('screener, warm cache', ms, SCREENER_BUDGET_MS);
  });

  it('moves the cache on to the next market day', () => {
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const closes = freshCloses();
      screenInstruments(sources(closes), {}, NOW - TICKS_PER_DAY);
      const start = performance.now();
      screenInstruments(sources(closes), {}, NOW);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expectWithinBudget('screener, next market day', times[2], SCREENER_BUDGET_MS);
  });

  it('computes the movers of the day', () => {
    const { world, context } = engine.world;
    const ms = medianMs(() => marketMovers(world, context, engine.prices, NOW), 9);
    console.info(`movers: ${ms.toFixed(1)} ms`);
  });
});
