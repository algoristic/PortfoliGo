import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { buildPlayerExport, encodePlayerExport } from '@app/players/domain/player-export-logic';
import { MarketHistoryRun } from '@app/players/domain/player-import-logic';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import { EngineHost, generateStandardWorld } from './engine-host';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

import { BUDGETS_MS, expectWithinBudget } from '../../../../testing/perf';
import {
  EngineCommandMessage,
  EngineEventMessage,
  ReplyPayload,
} from '../service/engine-service.model';

// Budget of TS §14.3 (AP 6.1): a player with 50 game years (standard world, 01.04.2030 to
// 01.04.2080) is playable in under 3 s after the import, measured from `importPlayer` to the reply
// of `loadPlayer` with the real loop (`setTimeout`, slices that yield) and in-memory storage. The
// history run from the epoch to the export day is the larger part; it is logged on its own.

const PLAYER = {
  playerId: 'perf-import',
  seed: 'perf-import',
  start: { startCapital: 1_000_000, netIncome: 280_000, livingCosts: 170_000 },
};
const EXPORT_TICK = dateTimeToTick({ year: 2080, month: 4, day: 3, hour: 11, minute: 20 });

function command(type: string, payload: unknown, id: string): EngineCommandMessage {
  return { protocol: 1, id, type, payload } as EngineCommandMessage;
}

/** Wall time from `importPlayer` to the reply of `loadPlayer` of the imported player. */
async function importMs(content: string, run: number): Promise<{ total: number; load: number }> {
  const replies = new Map<string, ReplyPayload>();
  const host = new EngineHost(
    {
      now: () => Date.now(),
      post: (message: EngineEventMessage) => {
        if (message.type === 'reply' && message.replyTo !== undefined) {
          replies.set(message.replyTo, message.payload);
        }
      },
      timer: {
        set: (callback, delayMs) => setTimeout(callback, delayMs),
        clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      storage: new InMemoryEngineStorage(),
      yieldToEvents: () => new Promise((resolve) => setTimeout(resolve, 0)),
    },
    { candleBackfillFrom: null },
  );
  const playerId = `${PLAYER.playerId}-${run}`;
  const start = performance.now();
  await host.receive(command('importPlayer', { content, playerId }, 'import'));
  const imported = performance.now();
  await host.receive(command('loadPlayer', { ...PLAYER, playerId }, 'load'));
  const end = performance.now();
  host.dispose();
  expect(replies.get('import')).toMatchObject({ ok: true, data: { marketChecksumMatches: true } });
  expect(replies.get('load')).toMatchObject({ ok: true, data: { tick: EXPORT_TICK } });
  return { total: end - start, load: end - imported };
}

describe('player import performance', () => {
  let content = '';

  beforeAll(async () => {
    const generated = generateStandardWorld(PLAYER.seed);
    const world = createGameWorld(generated.seedKey, generated.world);
    const engine = GameEngine.start(world, PLAYER.start);
    const transactions = engine.drainTransactions();
    const notifications: GameNotification[] = [];
    const points: DailyPoint[] = [];
    for (let year = 2031; year <= 2080; year++) {
      engine.runUntil(Math.min(EXPORT_TICK, dateTimeToTick({ year, month: 4, day: 1 })));
      transactions.push(...engine.drainTransactions());
      notifications.push(...engine.drainNotifications());
      points.push(...engine.drainDailyPoints());
      engine.drainEvents();
    }
    engine.runUntil(EXPORT_TICK);
    content = await encodePlayerExport(
      buildPlayerExport({
        appVersion: '1.0.0',
        exportedAtMs: Date.UTC(2026, 10, 14),
        name: 'Fünfzig Jahre',
        seed: PLAYER.seed,
        speed: '1h',
        paused: false,
        snapshot: engine.snapshot(),
        market: engine.marketAtDayStart(),
        transactions: [transactions, engine.drainTransactions()],
        notifications: [notifications, engine.drainNotifications()],
        points: [points, engine.drainDailyPoints()],
      }),
    );
    console.info(`player import: export of 50 game years, ${content.length} characters`);
  });

  it('makes a player with 50 game years playable within the budget', async () => {
    const generated = generateStandardWorld(PLAYER.seed);
    const context = createGameWorld(generated.seedKey, generated.world).context;
    const historyStart = performance.now();
    new MarketHistoryRun(context, dayIndex(EXPORT_TICK)).run(() => false);
    console.info(
      `player import: history run epoch → 2080 alone ${(performance.now() - historyStart).toFixed(0)} ms`,
    );

    const runs: { total: number; load: number }[] = [];
    for (let run = 0; run < 3; run++) {
      runs.push(await importMs(content, run));
    }
    runs.sort((a, b) => a.total - b.total);
    const median = runs[1];
    console.info(`player import: loadPlayer after the import ${median.load.toFixed(0)} ms`);
    expectWithinBudget(
      'player import: 50 game years playable',
      median.total,
      BUDGETS_MS.importPlayable,
    );
  });
});
