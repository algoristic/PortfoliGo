import { dateTimeToTick, dayStartTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_WEEK } from '@app/clock/domain/models/time.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { PriceSource } from '@app/market/domain/price-source';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameSnapshot, GameState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { withBooks } from './testing/banking-game';
import { MINI_START_CONDITIONS } from './testing/mini-game';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../testing/perf';

// Budget of TS §14.3: the engine at 1 game week per second below 15 % of a core, i.e. one game
// year live within 15 % of 52.18 s. Live, the host runs one frame of ticks (16 ms at 1 w/s) per
// call and writes the daily candles with high and low at every session close (TS §6.8).
// With open orders, the engine checks every minute of their sessions (TS §3.8). Twenty limit orders
// that never execute (good till cancelled) stay open for the whole year: on shares of several
// exchanges, or half of them on ETFs, whose minute curves need the indicative values of all index
// constituents during the ETF session on every trading day (TS §7.5).

const FRAMES_PER_SECOND = 60;
const TICKS_PER_FRAME = Math.ceil(TICKS_PER_WEEK / FRAMES_PER_SECOND);
const END_TICK = dateTimeToTick({ year: 2031, month: 4, day: 1 });

describe('engine performance', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: readonly FactorStateEntry[];
  /** `start` with a depot `dep-3` and twenty open orders placed at the start tick. */
  let withOrders: GameSnapshot;
  /** As `withOrders`, but ten of the orders are on ETFs. */
  let withEtfOrders: GameSnapshot;

  beforeAll(() => {
    const seedKey = deriveSeedKey('perf-engine');
    world = createGameWorld(seedKey, generateWorld(seedKey));
    const engine = GameEngine.start(world, MINI_START_CONDITIONS);
    start = engine.snapshot();
    monthStarts = engine.monthStartsAfter(-1);
    const books = withBooks(start, {
      accounts: [{ kind: 'clearing', bankId: world.world.banks[0].id, balance: 10_000_000 }],
    });
    withOrders = withLimitOrders(
      books,
      world.world.companies.slice(0, 20).map(({ id }) => id),
    );
    withEtfOrders = withLimitOrders(books, [
      ...world.world.companies.slice(0, 10).map(({ id }) => id),
      ...world.world.etfs.slice(0, 10).map(({ id }) => id),
    ]);
  });

  /** Places one buy limit order far below the price (good till cancelled) per instrument. */
  function withLimitOrders(books: GameSnapshot, ids: readonly string[]): GameSnapshot {
    const trading = GameEngine.restore(world, books, { monthStarts });
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
          // 100 shares at 0.02 € stay above the minimum order value of 1 € and are never reached
          // (since AP 7.3d one order at 0.50 € no longer stays open for the whole year).
          size: { kind: 'quantity', quantity: 100_000_000 },
          limit: 0.02,
          stop: null,
          validity: { kind: 'gtc' },
        },
      });
      expect(result.ok).toBe(true);
    });
    return trading.snapshot();
  }

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

  it('runs one game year in batch mode with ten open ETF and ten share orders within the catch-up budget', () => {
    let open = 0;
    const ms = medianMs(() => {
      const engine = GameEngine.restore(world, withEtfOrders, { monthStarts });
      engine.runUntil(END_TICK);
      engine.drainEvents();
      open = engine.player.orders.length;
    }, 3);
    expect(open).toBe(20);
    expectWithinBudget(
      'engine: one game year in batch mode with 10 open ETF and 10 share orders',
      ms,
      BUDGETS_MS.catchUpYear,
    );
  });

  it('runs one game year in batch mode with twenty share and ten ETF positions within the catch-up budget', () => {
    // AP 5.2: every day values the depot for the custody fee; the ex-dates pay the holdings.
    const held = withBooks(start, {
      accounts: [{ kind: 'clearing', bankId: world.world.banks[0].id, balance: 0 }],
    }) as GameState;
    held.player.positions = [
      ...world.world.companies.slice(0, 20).map(({ id }) => id),
      ...world.world.etfs.slice(0, 10).map(({ id }) => id),
    ].map((instrumentId) => ({
      depotId: 'dep-3',
      instrumentId,
      quantity: 10_000_000,
      lots: [{ buyTick: 0, quantity: 10_000_000, cost: 100_000 }],
      realizedGain: 0,
      distributions: 0,
    }));
    let payouts = 0;
    const ms = medianMs(() => {
      const engine = GameEngine.restore(world, held, { monthStarts });
      engine.runUntil(END_TICK);
      engine.drainEvents();
      payouts = engine
        .drainTransactions()
        .filter(({ type }) => type === 'dividend' || type === 'fund-distribution').length;
    }, 3);
    expect(payouts).toBeGreaterThan(0);
    expectWithinBudget(
      'engine: one game year in batch mode with 20 share and 10 ETF positions',
      ms,
      BUDGETS_MS.catchUpYear,
    );
  });

  it('runs one game year in batch mode with ten savings plans within the catch-up budget', () => {
    // AP 5.6b: five shares and five ETFs bought every month at their exchange's open (TS §7.8).
    const funded = withBooks(start, {
      accounts: [{ kind: 'clearing', bankId: world.world.banks[0].id, balance: 10_000_000 }],
    });
    const planning = GameEngine.restore(world, funded, { monthStarts });
    const eligible = [
      ...world.world.companies.filter(({ savingsPlanEligible }) => savingsPlanEligible).slice(0, 5),
      ...world.world.etfs.slice(0, 5),
    ];
    eligible.forEach(({ id }, n) => {
      const result = planning.applyCommand({
        id: `plan-${n}`,
        tick: planning.tick,
        type: 'createSavingsPlan',
        plan: { depotId: 'dep-3', instrumentId: id, amount: 10_000, day: 1 + 2 * n },
      });
      expect(result.ok).toBe(true);
    });
    const withPlans = planning.snapshot();
    let purchases = 0;
    const ms = medianMs(() => {
      const engine = GameEngine.restore(world, withPlans, { monthStarts });
      engine.runUntil(END_TICK);
      engine.drainEvents();
      purchases = engine
        .drainTransactions()
        .filter(({ refs }) => refs?.['savingsPlanId'] !== undefined).length;
    }, 3);
    // Twelve months of ten plans.
    expect(purchases).toBe(120);
    expectWithinBudget(
      'engine: one game year in batch mode with 10 savings plans',
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
