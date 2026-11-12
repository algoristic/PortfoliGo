import { GAME_START_TICK } from '@app/clock/domain/calendar-logic';

import { EngineHost } from './engine-host';
import { EngineStorage } from './engine-host.model';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

import { BUDGETS_MS, expectWithinBudget } from '../../../../testing/perf';
import {
  EngineCommandMessage,
  EngineEventMessage,
  ProgressPayload,
} from '../service/engine-service.model';
import { ManualTimeline } from '../testing/manual-timeline';

// Budget of TS §14.3: the catch-up after loading (TS §3.7) of 30 days below 1 s and of one game year
// below 5 s, standard world, in-memory storage. Measured from `loadPlayer` (world, restore, replay)
// to the end of the catch-up, with the real loop: 8 ms passes, 0 ms between them, daily candles.

const PLAYER = {
  playerId: 'perf',
  seed: 'perf-catch-up',
  start: { startCapital: 1_000_000, netIncome: 280_000, livingCosts: 170_000 },
};
const DAY_MS = 86_400_000;

/** Reads from the stored game, writes into a throw-away storage: every run starts alike. */
function overlay(base: EngineStorage): EngineStorage {
  const writes = new InMemoryEngineStorage();
  return {
    appendCommand: (...args) => writes.appendCommand(...args),
    saveClock: (...args) => writes.saveClock(...args),
    saveSnapshot: (...args) => writes.saveSnapshot(...args),
    saveMonthStarts: (...args) => writes.saveMonthStarts(...args),
    saveDailyCandles: (...args) => writes.saveDailyCandles(...args),
    loadDailyCandles: (...args) => writes.loadDailyCandles(...args),
    clearCandles: (...args) => writes.clearCandles(...args),
    loadPlayerState: (...args) => base.loadPlayerState(...args),
    discardAfter: (...args) => writes.discardAfter(...args),
    deletePlayer: (...args) => writes.deletePlayer(...args),
  };
}

function command(type: string, payload: unknown): EngineCommandMessage {
  return { protocol: 1, id: type, type, payload } as EngineCommandMessage;
}

/** Wall time from `loadPlayer` to the end of a catch-up of `absenceMs`. */
async function catchUpMs(base: InMemoryEngineStorage, absenceMs: number): Promise<number> {
  const clock = base.clocks.get(PLAYER.playerId);
  if (clock === undefined) {
    throw new Error('no stored clock');
  }
  base.clocks.set(PLAYER.playerId, { ...clock, lastSeenAt: Date.now() - absenceMs });
  let resolveDone: (progress: ProgressPayload) => void = () => undefined;
  const done = new Promise<ProgressPayload>((resolve) => (resolveDone = resolve));
  const host = new EngineHost(
    {
      now: () => Date.now(),
      post: (message: EngineEventMessage) => {
        if (
          message.type === 'progress' &&
          message.payload.kind === 'catch-up' &&
          message.payload.state === 'done'
        ) {
          resolveDone(message.payload);
        }
      },
      timer: {
        set: (callback, delayMs) => setTimeout(callback, delayMs),
        clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      storage: overlay(base),
    },
    { candleBackfillFrom: null },
  );
  const start = performance.now();
  await host.receive(command('loadPlayer', PLAYER));
  const progress = await done;
  const ms = performance.now() - start;
  host.dispose();
  expect(progress.total).toBeGreaterThanOrEqual(Math.floor(absenceMs / 60_000));
  return ms;
}

async function medianOf(runs: number, measure: () => Promise<number>): Promise<number> {
  await measure();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    times.push(await measure());
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('EngineHost performance', () => {
  const base = new InMemoryEngineStorage();

  beforeAll(async () => {
    // A new player of the standard world, running and stored at the game start.
    const timeline = new ManualTimeline();
    const host = new EngineHost(
      { now: timeline.now, post: () => undefined, timer: timeline, storage: base },
      { candleBackfillFrom: null },
    );
    await host.receive(command('loadPlayer', PLAYER));
    await host.receive(command('resume', {}));
    await host.receive(command('unloadPlayer', {}));
    expect(base.clocks.get(PLAYER.playerId)).toMatchObject({
      tick: GAME_START_TICK,
      paused: false,
    });
  });

  it('catches up 30 days within the budget', async () => {
    const ms = await medianOf(3, () => catchUpMs(base, 30 * DAY_MS));
    expectWithinBudget('engine host: catch-up of 30 days', ms, BUDGETS_MS.catchUp30Days);
  });

  it('catches up one game year within the budget', async () => {
    const ms = await medianOf(3, () => catchUpMs(base, 365 * DAY_MS));
    expectWithinBudget('engine host: catch-up of one game year', ms, BUDGETS_MS.catchUpYear);
  });
});
