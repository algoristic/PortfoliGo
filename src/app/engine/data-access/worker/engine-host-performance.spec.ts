import { dayIndex } from '@app/clock/domain/calendar-logic';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { EngineQueryResultOf, ProjectionPayload } from '../service/engine-service.model';
import {
  advance,
  FINE,
  GAME_START,
  gameTick,
  HostHarness,
  MINI_PLAYER as PLAYER,
  runUntil,
} from '../testing/host-harness';

// Daily series and performance figures through the worker host (AP 5.7, TS §7.9, §8.2–§8.4,
// §9.1, §9.2): the figures in every projection, the query of the daily series with thinning, the
// same series live and in batch mode, and the series over a reload from IndexedDB.

const START_DAY = dayIndex(GAME_START);

function lastProjection(harness: HostHarness): ProjectionPayload {
  return harness.events('projection').at(-1)?.payload as ProjectionPayload;
}

function jumpsDone(harness: HostHarness): number {
  return harness.progress.filter(({ kind, state }) => kind === 'jump' && state === 'done').length;
}

async function history(
  harness: HostHarness,
  query: { fromDay?: number; maxPoints?: number } = {},
): Promise<EngineQueryResultOf<'performanceHistory'>> {
  const reply = await harness.send('query', { query: { kind: 'performanceHistory', ...query } });
  if (!reply.ok) {
    throw new Error(`query failed: ${reply.error}`);
  }
  return reply.data as EngineQueryResultOf<'performanceHistory'>;
}

async function jumpTo(harness: HostHarness, tick: number): Promise<void> {
  const done = jumpsDone(harness);
  await harness.send('jumpTo', { target: { kind: 'date', tick } });
  await runUntil(harness, () => jumpsDone(harness) > done);
}

describe('EngineHost performance', () => {
  it('sends the figures with the projection after loading', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', PLAYER);
    const { performance, netWorth } = lastProjection(harness);
    expect(performance).toMatchObject({
      tick: GAME_START,
      startTick: GAME_START,
      startValue: PLAYER.start.startCapital,
      netWorth,
      cash: PLAYER.start.startCapital,
      securities: 0,
      totalFlow: 0,
      comparison: PLAYER.start.startCapital,
      sinceStart: 0,
      today: { change: 0, ratio: 0, flow: 0 },
      returns: { sinceStart: 0, yearToDate: 0, annualized: null },
      skippedDays: 0,
      benchmark: {
        value: PLAYER.start.startCapital,
        returns: { sinceStart: 0, yearToDate: 0, annualized: null },
      },
    });
    expect((await history(harness)).points).toEqual([]);
    harness.host.dispose();
  });

  it('answers the daily series up to the last day that ended, thinned on request', async () => {
    const harness = new HostHarness({ config: FINE });
    await harness.send('loadPlayer', PLAYER);
    await jumpTo(harness, gameTick(2030, 6, 15, 12));
    const all = await history(harness);
    expect(all.tick).toBe(gameTick(2030, 6, 15, 12));
    expect(all.resolution).toBe('day');
    expect(all.total).toBe(75);
    expect(all.points.map(({ day }) => day)).toEqual(
      Array.from({ length: 75 }, (_, i) => START_DAY + i),
    );
    // The figures go on from the last point: today's flows and change on top of its end.
    await advance(harness, 300);
    const figures = lastProjection(harness).performance;
    const last = all.points.at(-1) as DailyPoint;
    expect(figures?.comparison).toBe(last.comparison + (figures?.today.flow ?? Number.NaN));
    expect(figures?.today.change).toBe(
      (figures?.netWorth ?? Number.NaN) - last.netWorth - (figures?.today.flow ?? Number.NaN),
    );

    const june = await history(harness, { fromDay: dayIndex(gameTick(2030, 6, 1)) });
    expect(june.points.map(({ day }) => day)).toEqual(
      Array.from({ length: 14 }, (_, i) => dayIndex(gameTick(2030, 6, 1)) + i),
    );
    const weeks = await history(harness, { maxPoints: 20 });
    expect(weeks.resolution).toBe('week');
    expect(weeks.total).toBe(75);
    expect(weeks.points[0]).toEqual(all.points[0]);
    expect(weeks.points.at(-1)).toEqual(last);
    expect(weeks.points.length).toBeLessThanOrEqual(20);

    for (const maxPoints of [1, 2.5, 10_000]) {
      expect(
        await harness.send('query', { query: { kind: 'performanceHistory', maxPoints } }),
      ).toMatchObject({ ok: false, error: 'invalid-command' });
    }
    harness.host.dispose();
  });

  // AP 5.7: batch mode writes the same series as the live clock
  it('writes the same series live and in batch mode', async () => {
    const target = gameTick(2030, 5, 20);
    const jumped = new HostHarness({ config: FINE });
    await jumped.send('loadPlayer', PLAYER);
    await jumpTo(jumped, target);
    const batch = await history(jumped);

    const live = new HostHarness({ config: FINE });
    await live.send('loadPlayer', PLAYER);
    await live.send('setSpeed', { speed: '1w' });
    await live.send('resume', {});
    await runUntil(live, () => live.clock.tick >= target);
    await live.send('pause', {});
    const running = await history(live, { maxPoints: 2_000 });
    expect(running.points.length).toBeGreaterThanOrEqual(batch.points.length);
    expect(running.points.slice(0, batch.points.length)).toEqual(batch.points);
    jumped.host.dispose();
    live.host.dispose();
  });

  it('keeps the series in IndexedDB over a reload', async () => {
    const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
    await first.send('loadPlayer', PLAYER);
    await jumpTo(first, gameTick(2030, 12, 15));
    await jumpTo(first, gameTick(2031, 2, 10));
    const before = await history(first, { maxPoints: 2_000 });
    await first.send('unloadPlayer', {});
    first.host.dispose();

    const second = new HostHarness(
      { config: FINE },
      { storage: new IndexedDbEngineStorage(), startMs: first.timeline.now() },
    );
    await second.send('loadPlayer', PLAYER);
    const after = await history(second, { maxPoints: 2_000 });
    expect(after.points).toEqual(before.points);
    expect(after.total).toBe(dayIndex(gameTick(2031, 2, 10)) - START_DAY);
    const stored = await new IndexedDbEngineStorage().loadDailyPoints(
      PLAYER.playerId,
      START_DAY,
      dayIndex(gameTick(2031, 2, 10)),
    );
    expect(stored).toEqual(before.points);
    second.host.dispose();
  });
});
