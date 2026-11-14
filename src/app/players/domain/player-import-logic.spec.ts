import fc from 'fast-check';

import { OPENABLE_ACCOUNT_KINDS } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { GameEngine } from '@app/engine/domain/game-engine';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';
import { GameWorld } from '@app/engine/domain/models/game-world.model';
import { miniGame, MiniGame } from '@app/engine/domain/testing/mini-game';
import { DEFAULT_MARKET_CONFIG } from '@app/market/domain/default-market-config';
import { GOLDEN_CHECKSUMS, GOLDEN_SEED } from '@app/market/domain/golden-master';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { createMarketContext } from '@app/market/domain/market-context';
import { marketStateAt } from '@app/market/domain/market-history';
import { advanceMarket, createMarketState } from '@app/market/domain/market-step';
import { miniMarket } from '@app/market/domain/testing/mini-market';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { ORDER_SIDES } from '@app/trading/domain/models/order.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { PlayerExport } from './models/player-export.model';
import { buildPlayerExport, decodePlayerExport, encodePlayerExport } from './player-export-logic';
import { importedGame, importedPlayerName, MarketHistoryRun } from './player-import-logic';

import { TEST_SEEDS } from '../../../testing/seeds';

// Import (TS §10.3): the history run from the epoch, the imported game and the name of an imported
// player. The round trip export → import is a property on the mini world: random commands, then
// the state at the export tick (player, scheduler, command IDs, market) and the journal are equal,
// and both games go on alike.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_TICK = 60_000 / TICKS_PER_MINUTE;

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function gameTick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / MS_PER_TICK;
}

type CommandBody = GameCommand extends infer C
  ? C extends GameCommand
    ? Omit<C, 'id' | 'tick'>
    : never
  : never;

/** Ticks of the runs: from the game start to the end of May 2030. */
const LAST_TICK = gameTick(2030, 5, 31, 23, 59);

const arbCommandBody = (
  bankIds: readonly string[],
  instruments: readonly string[],
): fc.Arbitrary<CommandBody> =>
  fc.oneof(
    fc.record({
      type: fc.constant('openAccount' as const),
      bankId: fc.constantFrom(...bankIds),
      kind: fc.constantFrom(...OPENABLE_ACCOUNT_KINDS),
    }),
    fc.record({
      type: fc.constant('transfer' as const),
      fromAccountId: fc.constantFrom('acc-1', 'acc-2', 'acc-3'),
      toAccountId: fc.constantFrom('acc-1', 'acc-2', 'acc-3'),
      amount: fc.integer({ min: 1, max: 600_000 }),
      purpose: fc.string({ maxLength: 8 }),
    }),
    fc.record({
      type: fc.constant('placeOrder' as const),
      order: fc.record({
        depotId: fc.constantFrom('dep-2', 'dep-3', 'dep-4'),
        instrumentId: fc.constantFrom(...instruments),
        side: fc.constantFrom(...ORDER_SIDES),
        type: fc.constant('market' as const),
        size: fc
          .integer({ min: 1, max: 20 })
          .map((shares) => ({ kind: 'quantity' as const, quantity: shares * 1_000_000 })),
        limit: fc.constant(null),
        stop: fc.constant(null),
        validity: fc.constant({ kind: 'day' as const }),
      }),
    }),
    fc.record({
      type: fc.constant('placeOrder' as const),
      order: fc.record({
        depotId: fc.constantFrom('dep-2', 'dep-3', 'dep-4'),
        instrumentId: fc.constantFrom(...instruments),
        side: fc.constant('buy' as const),
        type: fc.constant('limit' as const),
        size: fc.constant({ kind: 'quantity' as const, quantity: 1_000_000 }),
        limit: fc.integer({ min: 1, max: 20_000 }).map((cents) => cents / 100),
        stop: fc.constant(null),
        validity: fc.constant({ kind: 'gtc' as const }),
      }),
    }),
    fc.record({
      type: fc.constant('updateWatchlist' as const),
      ids: fc.subarray([...instruments]),
    }),
    fc.record({
      type: fc.constant('setBackgroundMode' as const),
      mode: fc.constantFrom(...BACKGROUND_MODES),
    }),
    fc.record({
      type: fc.constant('createSavingsPlan' as const),
      plan: fc.record({
        depotId: fc.constantFrom('dep-2', 'dep-3'),
        instrumentId: fc.constantFrom(...instruments),
        amount: fc.integer({ min: 2_500, max: 50_000 }),
        day: fc.integer({ min: 1, max: 28 }),
      }),
    }),
  );

/** Commands at ascending random ticks, and the export tick after them. */
const arbGame = (
  bankIds: readonly string[],
  instruments: readonly string[],
): fc.Arbitrary<{ commands: { tick: number; body: CommandBody }[]; exportTick: number }> =>
  fc
    .tuple(
      fc.array(
        fc.record({
          tick: fc.integer({ min: GAME_START_TICK, max: LAST_TICK }),
          body: arbCommandBody(bankIds, instruments),
        }),
        { maxLength: 12 },
      ),
      fc.integer({ min: GAME_START_TICK, max: LAST_TICK }),
    )
    .map(([commands, exportTick]) => {
      const sorted = commands.slice().sort((a, b) => a.tick - b.tick);
      return {
        commands: sorted,
        exportTick: Math.max(exportTick, sorted.at(-1)?.tick ?? GAME_START_TICK),
      };
    });

async function decoded(text: string): Promise<PlayerExport> {
  const result = await decodePlayerExport(text);
  if (!result.ok) {
    throw new Error(`export not readable: ${result.error}`);
  }
  return result.export;
}

describe('importedPlayerName', () => {
  // TS §10.3: name of an imported player, at most 40 code points with the suffix
  it.each([
    ['Mein Depot', ' (Import)', 'Mein Depot (Import)'],
    ['  Anna  ', ' (Import)', 'Anna (Import)'],
    ['x'.repeat(40), ' (Import)', `${'x'.repeat(31)} (Import)`],
    [`${'x'.repeat(30)}  y`, ' (Import)', `${'x'.repeat(30)} (Import)`],
    ['😀'.repeat(40), ' (Import)', `${'😀'.repeat(31)} (Import)`],
    [' ', ' (Import)', '(Import)'],
  ])('names %j with %j as %j', (name, suffix, expected) => {
    expect(importedPlayerName(name, suffix)).toBe(expected);
  });

  it('keeps every result within 40 code points and starting with the trimmed name', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }).filter((name) => name.trim() !== ''),
        (name) => {
          const result = importedPlayerName(name, ' (Import)');
          expect([...result].length).toBeLessThanOrEqual(40);
          expect(result.endsWith(' (Import)')).toBe(true);
          expect(name.trim().startsWith(result.slice(0, -' (Import)'.length).trim())).toBe(true);
        },
      ),
    );
  });
});

describe('MarketHistoryRun', () => {
  it('reaches the frozen market state of the game start in slices (golden master)', () => {
    const seedKey = deriveSeedKey(GOLDEN_SEED);
    const context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);
    const toDay = GAME_START_TICK / TICKS_PER_DAY;
    const run = new MarketHistoryRun(context, toDay);
    let slices = 0;
    let steps = 0;
    while (!run.run(() => ++steps % 97 === 0)) {
      slices++;
      expect(run.done).toBeLessThan(toDay);
    }
    expect(slices).toBeGreaterThan(30);
    expect(run.done).toBe(toDay);
    expect(run.checksum).toBe(GOLDEN_CHECKSUMS.gameStart);
  });

  it('gives month starts from which every earlier day is the day of one run', () => {
    const { context } = miniMarket(TEST_SEEDS.mini);
    const toDay = gameTick(2030, 5, 15) / TICKS_PER_DAY;
    const run = new MarketHistoryRun(context, toDay);
    run.run(() => false);
    const history = { monthStarts: run.monthStarts.slice() };
    fc.assert(
      fc.property(fc.integer({ min: 0, max: toDay - 1 }), (day) => {
        const reference = createMarketState(context);
        advanceMarket(context, reference, day);
        expect(marketChecksum(marketStateAt(context, history, day))).toBe(
          marketChecksum(reference),
        );
      }),
      { numRuns: 15 },
    );
    expect(run.monthStarts.every(({ day }) => day < toDay)).toBe(true);
  });

  it('refuses its results before the export day', () => {
    const { context } = miniMarket(TEST_SEEDS.mini);
    const run = new MarketHistoryRun(context, 40);
    run.run(() => true);
    expect(run.done).toBe(1);
    expect(() => run.checksum).toThrow(/not been reached/);
    expect(() => run.monthStarts).toThrow(/not been reached/);
  });
});

describe('importedGame', () => {
  let mini: MiniGame;
  let world: GameWorld;
  let bankIds: string[];
  let instruments: string[];

  beforeAll(() => {
    mini = miniGame(TEST_SEEDS.mini);
    world = mini.world;
    bankIds = world.world.banks.map(({ id }) => id);
    const { companies, etfs } = world.world;
    instruments = [companies[0].id, companies[1].id, etfs[0].id];
  });

  it('continues the exported game bit for bit (round trip, US-EX-02)', async () => {
    await fc.assert(
      fc.asyncProperty(arbGame(bankIds, instruments), async ({ commands, exportTick }) => {
        const original = GameEngine.restore(world, mini.start, { monthStarts: mini.monthStarts });
        let n = 0;
        for (const { tick, body } of commands) {
          original.runUntil(tick);
          original.applyCommand({ ...body, id: `c${++n}`, tick: original.tick } as GameCommand);
        }
        original.runUntil(exportTick);
        const transactions: Transaction[] = [...mini.journal, ...original.drainTransactions()];
        const notifications: GameNotification[] = original.drainNotifications();
        const points: DailyPoint[] = original.drainDailyPoints();
        const content = buildPlayerExport({
          appVersion: '1.0.0',
          exportedAtMs: Date.UTC(2026, 10, 14),
          name: 'Rundreise',
          seed: TEST_SEEDS.mini,
          speed: '1h',
          paused: false,
          snapshot: original.snapshot(),
          market: original.marketAtDayStart(),
          transactions: [transactions],
          notifications: [notifications],
          points: [points],
        });
        const file = await decoded(await encodePlayerExport(content));

        const run = new MarketHistoryRun(world.context, file.market.day);
        run.run(() => false);
        const imported = importedGame(world.context, file, run);
        const restored = GameEngine.restore(world, imported.snapshot, {
          monthStarts: imported.monthStarts,
        });

        expect(imported.marketChecksumMatches).toBe(true);
        expect(restored.snapshot()).toEqual(original.snapshot());
        expect(marketChecksum(restored.snapshot().market)).toBe(
          marketChecksum(original.snapshot().market),
        );
        expect(file.transactions).toEqual(transactions);
        expect(file.notifications).toEqual(notifications);
        expect(file.series.performance).toEqual(
          points.filter(({ day }) => day < original.player.performance.day),
        );

        const later = exportTick + 3 * TICKS_PER_DAY;
        original.runUntil(later);
        restored.runUntil(later);
        expect(restored.snapshot()).toEqual(original.snapshot());
        expect(restored.drainTransactions()).toEqual(original.drainTransactions());
        expect(restored.drainNotifications()).toEqual(original.drainNotifications());
      }),
      { numRuns: 6 },
    );
  });

  it('continues from the exported market when the run does not reach it', async () => {
    const file = await decoded(await encodePlayerExport(exportContent(mini)));
    const run = new MarketHistoryRun(world.context, file.market.day);
    run.run(() => false);
    const imported = importedGame(world.context, { ...file, marketChecksum: '0'.repeat(32) }, run);

    expect(imported.marketChecksumMatches).toBe(false);
    const restored = GameEngine.restore(world, imported.snapshot, {
      monthStarts: imported.monthStarts,
    });
    const reference = createMarketState(world.context);
    advanceMarket(world.context, reference, file.market.day + 1);
    expect(marketChecksum(restored.snapshot().market)).toBe(marketChecksum(reference));
    expect(imported.monthStarts.at(-1)?.day).toBe(file.market.day);
    expect(marketChecksum(imported.monthStarts.at(-1) ?? createMarketState(world.context))).toBe(
      file.marketChecksum,
    );
  });

  it('refuses a history run that ends on another day', async () => {
    const file = await decoded(await encodePlayerExport(exportContent(mini)));
    const run = new MarketHistoryRun(world.context, file.market.day - 1);
    run.run(() => false);
    expect(() => importedGame(world.context, file, run)).toThrow(/export day/);
  });
});

/** Export of a few days of the mini game. */
function exportContent(mini: MiniGame): ReturnType<typeof buildPlayerExport> {
  const engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
  engine.runUntil(gameTick(2030, 4, 10, 11, 5));
  return buildPlayerExport({
    appVersion: '1.0.0',
    exportedAtMs: Date.UTC(2026, 10, 14),
    name: 'Kurz',
    seed: TEST_SEEDS.mini,
    speed: '1h',
    paused: true,
    snapshot: engine.snapshot(),
    market: engine.marketAtDayStart(),
    transactions: [[...mini.journal, ...engine.drainTransactions()]],
    notifications: [engine.drainNotifications()],
    points: [engine.drainDailyPoints()],
  });
}
