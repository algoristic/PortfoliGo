import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { GameEngine } from '@app/engine/domain/game-engine';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { miniGame } from '@app/engine/domain/testing/mini-game';
import { Bank } from '@app/world/domain/models/bank.model';

import { PlayerExportContent } from '../models/player-export.model';
import { buildPlayerExport } from '../player-export-logic';

/** A game command without `id` and `tick`, which `apply` adds. */
type CommandSpec = GameCommand extends infer C
  ? C extends GameCommand
    ? Omit<C, 'id' | 'tick'>
    : never
  : never;

/** Seed of the mini world the export fixture plays on. */
export const EXPORT_FIXTURE_SEED = 'mini-1';

/** Export tick of the fixture: Wednesday, 15.05.2030, 14:37, while the exchanges trade. */
export const EXPORT_FIXTURE_TICK = dateTimeToTick({
  year: 2030,
  month: 5,
  day: 15,
  hour: 14,
  minute: 37,
});

/** Fixed values of the fixture that the worker takes from the wall clock and the build. */
export const EXPORT_FIXTURE_APP_VERSION = '0.0.0-fixture';
export const EXPORT_FIXTURE_EXPORTED_AT_MS = Date.UTC(2026, 10, 14, 9, 41);
export const EXPORT_FIXTURE_NAME = 'Export Fixture';

/**
 * A short, deterministic game on the mini world for the frozen export of format version 1: a
 * watchlist, custom background settings, a depot at a broker funded from the salary account, a
 * market purchase of the first share, a waiting limit order, and six weeks of salary, living costs,
 * notifications and the daily series; exported on 15.05.2030 at 14:37.
 */
export function exportFixtureContent(): PlayerExportContent {
  const mini = miniGame(EXPORT_FIXTURE_SEED);
  const engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
  const { world } = mini.world;
  const broker = world.banks.find(({ conditions }) => conditions.currentAccount === null) as Bank;
  const share = world.companies[0];
  let n = 0;
  const apply = (command: CommandSpec): void => {
    const result = engine.applyCommand({
      ...command,
      id: `f${++n}`,
      tick: engine.tick,
    } as GameCommand);
    if (!result.ok) {
      throw new Error(`exportFixtureContent: ${command.type} failed with ${result.error}`);
    }
  };
  apply({ type: 'updateWatchlist', ids: [share.id] });
  apply({ type: 'setBackgroundMode', mode: 'custom-speed', speed: '1d', pauseAfter: 60 });
  apply({ type: 'openAccount', bankId: broker.id, kind: 'depot' });
  apply({
    type: 'transfer',
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: 500_000,
    purpose: 'Depot',
  });
  const order = {
    depotId: 'dep-3',
    instrumentId: share.id,
    side: 'buy',
    size: { kind: 'quantity', quantity: 1_000_000 },
    stop: null,
  } as const;
  apply({
    type: 'placeOrder',
    order: { ...order, type: 'market', limit: null, validity: { kind: 'day' } },
  });
  apply({
    type: 'placeOrder',
    order: { ...order, type: 'limit', limit: 1, validity: { kind: 'gtc' } },
  });
  engine.runUntil(EXPORT_FIXTURE_TICK);
  const transactions: Transaction[] = [...mini.journal, ...engine.drainTransactions()];
  return buildPlayerExport({
    appVersion: EXPORT_FIXTURE_APP_VERSION,
    exportedAtMs: EXPORT_FIXTURE_EXPORTED_AT_MS,
    name: EXPORT_FIXTURE_NAME,
    seed: EXPORT_FIXTURE_SEED,
    speed: '1h',
    paused: true,
    snapshot: engine.snapshot(),
    market: engine.marketAtDayStart(),
    transactions: [transactions],
    notifications: [engine.drainNotifications()],
    points: [engine.drainDailyPoints()],
  });
}
