import { dateTimeToTick, dayStartTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_WEEK } from '@app/clock/domain/models/time.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { PriceSource } from '@app/market/domain/price-source';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameSnapshot } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { withBooks } from './testing/banking-game';
import { MINI_START_CONDITIONS } from './testing/mini-game';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../testing/perf';

// Budget of TS §14.3: the engine at 1 game week per second below 15 % of a core, i.e. one game
// year live within 15 % of 52.18 s. Live, the host runs one frame of ticks (16 ms at 1 w/s) per
// call and writes the daily candles with high and low at every session close (TS §6.8).
// With open orders, the engine checks every minute of their sessions (TS §3.8). Twenty limit orders
// on shares of several exchanges that never execute (good till cancelled) stay open for the whole
// year. Orders on ETFs cost the minute curves of their index constituents on every trading day
// (about 21 ms, about 6 s per year in batch mode, AP 5.1); they are not part of this budget yet.

const FRAMES_PER_SECOND = 60;
const TICKS_PER_FRAME = Math.ceil(TICKS_PER_WEEK / FRAMES_PER_SECOND);
const END_TICK = dateTimeToTick({ year: 2031, month: 4, day: 1 });

describe('engine performance', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: readonly FactorStateEntry[];
  /** `start` with a depot `dep-3` and twenty open orders placed at the start tick. */
  let withOrders: GameSnapshot;

  beforeAll(() => {
    const seedKey = deriveSeedKey('perf-engine');
    world = createGameWorld(seedKey, generateWorld(seedKey));
    const engine = GameEngine.start(world, MINI_START_CONDITIONS);
    start = engine.snapshot();
    monthStarts = engine.monthStartsAfter(-1);
    const books = withBooks(start, {
      accounts: [{ kind: 'clearing', bankId: world.world.banks[0].id, balance: 10_000_000 }],
    });
    const trading = GameEngine.restore(world, books, { monthStarts });
    const ids = world.world.companies.slice(0, 20).map(({ id }) => id);
    ids.forEach((instrumentId, n) => {
      const result = trading.applyCommand({
        id: `order-${n}`,
        tick: trading.tick,
        type: 'placeOrder',
        order: {
          depotId: 'dep-3',
          instrumentId,
          side: 'buy',
          type: 'limit',
          size: { kind: 'quantity', quantity: 10_000_000 },
          limit: 0.5,
          stop: null,
          validity: { kind: 'gtc' },
        },
      });
      expect(result.ok).toBe(true);
    });
    withOrders = trading.snapshot();
  });

  it('runs one game year live with daily candles within the budget', () => {
    let candleCount = 0;
    const ms = medianMs(
      () => {
        let source: PriceSource | undefined;
        const engine = GameEngine.restore(world, start, {
          monthStarts,
          prices: (gameWorld, history, market) => {
            source = new PriceSource(gameWorld.context, history, market);
            return source;
          },
        });
        candleCount = 0;
        while (engine.tick < END_TICK) {
          engine.runUntil(Math.min(END_TICK, engine.tick + TICKS_PER_FRAME));
          for (const event of engine.drainEvents()) {
            if (event.type !== 'session-closed') {
              continue;
            }
            const from = dayStartTick(event.day);
            for (const series of event.series) {
              candleCount += source?.candles(series, '1d', from, from, engine.tick).length ?? 0;
            }
          }
        }
      },
      3,
      0,
    );
    // 261 weekdays from 01.04.2030 to 31.03.2031 and 274 series of the standard world.
    expect(candleCount).toBe(261 * 274);
    expectWithinBudget(
      'engine: one game year live with daily candles',
      ms,
      BUDGETS_MS.gameYearLive,
    );
  });

  it('runs one game year in batch mode with twenty open share orders within the catch-up budget', () => {
    let open = 0;
    const ms = medianMs(() => {
      const engine = GameEngine.restore(world, withOrders, { monthStarts });
      engine.runUntil(END_TICK);
      engine.drainEvents();
      open = engine.player.orders.length;
    }, 3);
    expect(open).toBe(20);
    expectWithinBudget(
      'engine: one game year in batch mode with 20 open share orders',
      ms,
      BUDGETS_MS.catchUpYear,
    );
  });

  it('runs one game year in batch mode (without candles) within the budget', () => {
    const ms = medianMs(() => {
      const engine = GameEngine.restore(world, start, { monthStarts });
      engine.runUntil(END_TICK);
      engine.drainEvents();
    }, 3);
    expectWithinBudget('engine: one game year in batch mode', ms, BUDGETS_MS.gameYearLive);
  });
});
