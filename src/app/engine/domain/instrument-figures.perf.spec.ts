import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { createCurveTables } from '@app/market/domain/day-curve';
import { instrumentCatalog } from '@app/market/domain/instrument-catalog';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { InstrumentFacts } from './instrument-figures';
import { MINI_START_CONDITIONS } from './testing/mini-game';

import { expectWithinBudget, medianMs } from '../../../testing/perf';

// AP 4.5: one query of the instrument page in the worker over the standard world below 50 ms once
// the caches hold the market day. The first figures query steps about 13 months of market days for
// the window of volatility and beta; dividends recompute the months of their ex-dates.
const FACTS_BUDGET_MS = 50;
const NOW = dateTimeToTick({ year: 2030, month: 6, day: 12, hour: 16 });

describe('instrument facts performance', () => {
  let engine: GameEngine;
  let catalog: Instrument[];
  let history: FactorHistory;
  let stock: Instrument;
  let etf: Instrument;
  let worldIndex: Instrument;

  beforeAll(() => {
    const seedKey = deriveSeedKey('perf-instrument');
    const world = createGameWorld(seedKey, generateWorld(seedKey));
    engine = GameEngine.start(world, MINI_START_CONDITIONS);
    engine.runUntil(NOW + TICKS_PER_DAY);
    history = { monthStarts: [...engine.monthStartsAfter(-1)] };
    catalog = instrumentCatalog(world.world, world.context);
    stock = catalog.find(({ kind }) => kind === 'stock') as Instrument;
    etf = catalog.find(
      (instrument) => instrument.kind === 'etf' && instrument.distribution === 'distributing',
    ) as Instrument;
    const id = world.world.indices.find(({ kind }) => kind === 'world')?.id;
    worldIndex = catalog.find((instrument) => instrument.id === id) as Instrument;
  });

  function freshFacts(): InstrumentFacts {
    const { world, context } = engine.world;
    return new InstrumentFacts({
      world,
      context,
      catalog,
      prices: engine.prices,
      history,
      tables: createCurveTables(context),
      indicative: null,
    });
  }

  it('answers the first queries after loading', () => {
    const figures = medianMs(() => freshFacts().figures(stock, NOW), 3, 0);
    const etfFigures = medianMs(() => freshFacts().figures(etf, NOW), 3, 0);
    const stockDividends = medianMs(() => freshFacts().dividends(stock, NOW), 3, 0);
    const etfDividends = medianMs(() => freshFacts().dividends(etf, NOW), 3, 0);
    const composition = medianMs(() => freshFacts().composition(worldIndex, NOW), 3, 0);
    console.info(
      `instrument facts, cold: figures of a share ${figures.toFixed(1)} ms, of an ETF ` +
        `${etfFigures.toFixed(1)} ms, dividends of a share ` +
        `${stockDividends.toFixed(1)} ms, of an ETF ${etfDividends.toFixed(1)} ms, ` +
        `composition ${composition.toFixed(1)} ms`,
    );
  });

  it('answers the queries of an instrument on a cached market day within the budget', () => {
    const facts = freshFacts();
    facts.figures(stock, NOW - 60);
    for (const instrument of [stock, etf, worldIndex]) {
      const ms = medianMs(() => {
        facts.figures(instrument, NOW);
        facts.dividends(instrument, NOW);
        facts.composition(instrument, NOW);
      }, 9);
      expectWithinBudget(`instrument facts ${instrument.kind}, warm cache`, ms, FACTS_BUDGET_MS);
    }
  });

  it.each(['stock', 'etf'] as const)(
    'moves the figures of a %s on to the next market day within the budget',
    (kind) => {
      const instrument = kind === 'stock' ? stock : etf;
      const times: number[] = [];
      for (let run = 0; run < 5; run++) {
        const facts = freshFacts();
        facts.figures(instrument, NOW - TICKS_PER_DAY);
        const start = performance.now();
        facts.figures(instrument, NOW);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      expectWithinBudget(`instrument figures ${kind}, next market day`, times[2], FACTS_BUDGET_MS);
    },
  );
});
