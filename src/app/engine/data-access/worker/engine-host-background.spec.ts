import { SpeedId } from '@app/clock/domain/models/speed.model';
import { BackgroundMode, BackgroundPauseAfter } from '@app/engine/domain/models/game-state.model';

import { EngineHostConfig, StoredClock } from './engine-host.model';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import {
  advance,
  FINE,
  GAME_START,
  gameTick,
  HostHarness,
  HostHarnessPorts,
  MINI_PLAYER,
  runUntil,
} from '../testing/host-harness';

// Behaviour in the background through the worker host (TS §3.6, §3.7, §9.2; AP 6.7, E-35) on the
// mini world: modes while hidden, the deadline `backgroundPauseAfter` live and after closing, gaps
// in the loop and Chromium's `freeze`/`resume`, the auto-pause while hidden and the projections
// while hidden.

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** Every clock event is sent, also while hidden. */
const FINE_HIDDEN: Partial<EngineHostConfig> = { ...FINE, hiddenClockPerSecond: 100 };
/** One pass per second for long real-time spans; below the gap threshold of 5 s. */
const LONG: Partial<EngineHostConfig> = {
  loopIntervalMs: SECOND_MS,
  clockPerSecond: 100,
  hiddenClockPerSecond: 100,
};

/** The overdrawn player of `engine-host-notifications.spec.ts`: auto-pause at the first bank run. */
const OVERDRAWN = {
  ...MINI_PLAYER,
  start: { startCapital: 0, netIncome: 100_000, livingCosts: 5_000_000 },
};
const BANK_RUN = gameTick(2030, 4, 1, 6);

interface Background {
  mode: BackgroundMode;
  speed?: SpeedId;
  pauseAfter?: BackgroundPauseAfter;
}

/** Loads the player running at `speed` with the background settings, still visible. */
async function running(
  harness: HostHarness,
  speed: SpeedId,
  background: Background,
  player = MINI_PLAYER,
): Promise<void> {
  await harness.send('loadPlayer', player);
  await harness.send('setBackgroundMode', background);
  await harness.send('setSpeed', { speed });
  await harness.send('resume', {});
}

/**
 * A pause holds its clock event until the clock is written, which settles only after the passes of
 * `advance`; the next pass after the write sends the event.
 */
async function nextPass(harness: HostHarness): Promise<void> {
  await harness.host.settled();
  await advance(harness, SECOND_MS);
}

function catchUps(harness: HostHarness) {
  return harness.progress.filter(({ kind }) => kind === 'catch-up');
}

function catchUpDone(harness: HostHarness): boolean {
  return catchUps(harness).some(({ state }) => state === 'done');
}

/** A new tab on the same database. */
function reload(ports: HostHarnessPorts = {}, config = LONG): HostHarness {
  return new HostHarness({ config }, { storage: new IndexedDbEngineStorage(), ...ports });
}

async function storedClock(): Promise<StoredClock | undefined> {
  return (await new IndexedDbEngineStorage().loadPlayerState(MINI_PLAYER.playerId)).clock;
}

describe('EngineHost background', () => {
  describe('setBackgroundMode', () => {
    it('reports speed and deadline in the clock and keeps a missing one', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', MINI_PLAYER);
      expect(harness.clock).toMatchObject({
        backgroundMode: 'realtime',
        backgroundSpeed: '1h',
        backgroundPauseAfter: null,
      });
      await harness.send('setBackgroundMode', {
        mode: 'custom-speed',
        speed: '1d',
        pauseAfter: 30,
      });
      await advance(harness, 10);
      expect(harness.clock).toMatchObject({
        backgroundMode: 'custom-speed',
        backgroundSpeed: '1d',
        backgroundPauseAfter: 30,
      });
      await harness.send('setBackgroundMode', { mode: 'keep-speed' });
      await advance(harness, 10);
      expect(harness.clock).toMatchObject({
        backgroundMode: 'keep-speed',
        backgroundSpeed: '1d',
        backgroundPauseAfter: 30,
      });
      await harness.send('setBackgroundMode', { mode: 'keep-speed', pauseAfter: null });
      await advance(harness, 10);
      expect(harness.clock.backgroundPauseAfter).toBeNull();
    });

    it('rejects an unknown speed or deadline with invalid-command', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', MINI_PLAYER);
      await harness.host.receive({
        protocol: 1,
        id: 'speed',
        type: 'setBackgroundMode',
        payload: { mode: 'custom-speed', speed: 'warp' },
      });
      await harness.host.receive({
        protocol: 1,
        id: 'deadline',
        type: 'setBackgroundMode',
        payload: { mode: 'keep-speed', pauseAfter: 45 },
      });
      expect(harness.replyTo('speed')).toMatchObject({ ok: false, error: 'invalid-command' });
      expect(harness.replyTo('deadline')).toMatchObject({ ok: false, error: 'invalid-command' });
    });
  });

  describe('modes while hidden', () => {
    // TS §3.6, effective speed with chosen 1 h/s and `backgroundSpeed` 1 d/s; ticks from TS §3.4.
    it.each([
      ['realtime', 'realtime', 2 * MINUTE_MS, 2],
      ['pause', null, 2 * MINUTE_MS, 0],
      ['keep-speed', '1h', SECOND_MS, 60],
      ['custom-speed', '1d', SECOND_MS, 1_440],
    ] as const)('runs %s at %s while hidden', async (mode, effective, ms, ticks) => {
      const harness = new HostHarness({ config: FINE_HIDDEN });
      await running(harness, '1h', { mode, speed: '1d' });
      await harness.send('setVisibility', { visible: false });
      await advance(harness, ms);
      expect(harness.clock).toMatchObject({
        tick: GAME_START + ticks,
        speed: '1h',
        paused: false,
        visible: false,
        effectiveSpeed: effective,
      });
      await harness.send('setVisibility', { visible: true });
      await advance(harness, SECOND_MS);
      expect(harness.clock).toMatchObject({ tick: GAME_START + ticks + 60, effectiveSpeed: '1h' });
    });
  });

  describe('deadline while hidden (TS §3.6)', () => {
    // TS §3.6, examples of the deadline while hidden (hidden from tick T at wall clock H).
    it.each([
      ['realtime', '1h', '1h', 30, 30],
      ['keep-speed', '1min', '1h', 60, 3_600],
      ['custom-speed', '1min', '10min', 60, 36_000],
    ] as const)(
      'pauses %s chosen %s (background %s) after %d min at T + %d',
      async (mode, speed, backgroundSpeed, pauseAfter, ticks) => {
        const harness = new HostHarness({ config: LONG });
        await running(harness, speed, { mode, speed: backgroundSpeed, pauseAfter });
        await harness.send('setVisibility', { visible: false });
        await advance(harness, pauseAfter * MINUTE_MS - SECOND_MS);
        expect(harness.clock.paused).toBe(false);

        await advance(harness, SECOND_MS);
        await nextPass(harness);
        expect(harness.clock).toMatchObject({
          tick: GAME_START + ticks,
          paused: true,
          effectiveSpeed: null,
        });
        await expect(harness.storage.loadPlayerState('p1')).resolves.toMatchObject({
          clock: { tick: GAME_START + ticks, paused: true },
        });
        await advance(harness, 10 * MINUTE_MS);
        expect(harness.clock.tick).toBe(GAME_START + ticks);

        // The pause stays after returning, like a pause of the player.
        await harness.send('setVisibility', { visible: true });
        await advance(harness, SECOND_MS);
        expect(harness.clock).toMatchObject({
          tick: GAME_START + ticks,
          paused: true,
          visible: true,
        });
      },
    );

    it('never pauses without a deadline or in background mode pause', async () => {
      const keeping = new HostHarness({ config: LONG });
      await running(keeping, '1min', { mode: 'keep-speed', pauseAfter: null });
      await keeping.send('setVisibility', { visible: false });
      await advance(keeping, 2 * HOUR_MS);
      // 2 h × 3,600 s × 1 tick per second at 1 min/s.
      expect(keeping.clock).toMatchObject({ tick: GAME_START + 7_200, paused: false });

      const resting = new HostHarness({ config: LONG });
      await running(resting, '1h', { mode: 'pause', pauseAfter: 30 });
      await resting.send('setVisibility', { visible: false });
      await advance(resting, HOUR_MS);
      expect(resting.clock).toMatchObject({ tick: GAME_START, paused: false });
    });

    it('drops the deadline when visible before it and starts it anew when hidden again', async () => {
      const harness = new HostHarness({ config: LONG });
      await running(harness, '1min', { mode: 'keep-speed', pauseAfter: 15 });
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 10 * MINUTE_MS);
      await harness.send('setVisibility', { visible: true });
      await advance(harness, 10 * MINUTE_MS);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 14 * MINUTE_MS);
      // 34 minutes at 1 min/s, no pause: the deadline counts from the second hiding.
      expect(harness.clock).toMatchObject({ tick: GAME_START + 34 * 60, paused: false });
      await advance(harness, MINUTE_MS);
      await nextPass(harness);
      expect(harness.clock).toMatchObject({ tick: GAME_START + 35 * 60, paused: true });
    });

    it('counts a frozen page only up to the deadline (TS §3.6, frozen after 10 min)', async () => {
      const harness = new HostHarness({ config: LONG });
      await running(harness, '1h', { mode: 'keep-speed', pauseAfter: 30 });
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 10 * MINUTE_MS);
      expect(harness.clock.tick).toBe(GAME_START + 36_000);

      await harness.send('setFrozen', { frozen: true });
      harness.timeline.suspend(50 * MINUTE_MS);
      await harness.send('setFrozen', { frozen: false });
      await advance(harness, 0);
      await nextPass(harness);
      expect(harness.clock).toMatchObject({ tick: GAME_START + 36_020, paused: true });
    });
  });

  describe('gaps in the loop (TS §3.6, 1 w/s hidden in keep-speed)', () => {
    async function hiddenAtWeekPerSecond(): Promise<HostHarness> {
      const harness = new HostHarness({ config: FINE_HIDDEN });
      await running(harness, '1w', { mode: 'keep-speed' });
      await harness.send('setVisibility', { visible: false });
      await advance(harness, SECOND_MS);
      expect(harness.clock.tick).toBe(GAME_START + 10_080);
      return harness;
    }

    it('counts more than 5 s without a pass in real time only', async () => {
      const harness = await hiddenAtWeekPerSecond();
      const t = GAME_START + 10_080;
      harness.timeline.suspend(6 * SECOND_MS);
      await advance(harness, 0);
      expect(harness.clock.tick).toBe(t);

      harness.timeline.suspend(HOUR_MS);
      await advance(harness, 0);
      // The 6 s of the first gap carry over: ⌊3,606 s ÷ 60 s⌋ = 60.
      expect(harness.clock.tick).toBe(t + 60);
      await advance(harness, SECOND_MS);
      expect(harness.clock.tick).toBe(t + 60 + 10_080);
    });

    it('runs one hour without a pass as 60 ticks, then at full speed', async () => {
      const harness = await hiddenAtWeekPerSecond();
      const t = GAME_START + 10_080;
      harness.timeline.suspend(HOUR_MS);
      await advance(harness, 0);
      expect(harness.clock.tick).toBe(t + 60);
      await advance(harness, SECOND_MS);
      expect(harness.clock.tick).toBe(t + 10_140);
    });

    it('counts a frozen page as a gap regardless of its length', async () => {
      const harness = await hiddenAtWeekPerSecond();
      const t = GAME_START + 10_080;
      await advance(harness, SECOND_MS);
      expect(harness.clock.tick).toBe(t + 10_080);
      await harness.send('setFrozen', { frozen: true });
      harness.timeline.suspend(2 * SECOND_MS);
      await harness.send('setFrozen', { frozen: false });
      await advance(harness, 0);
      expect(harness.clock.tick).toBe(t + 10_080);
      await advance(harness, SECOND_MS);
      expect(harness.clock.tick).toBe(t + 2 * 10_080);
    });

    it('changes nothing at real-time speed', async () => {
      const harness = new HostHarness({ config: FINE_HIDDEN });
      await running(harness, '1h', { mode: 'realtime' });
      await harness.send('setVisibility', { visible: false });
      harness.timeline.suspend(HOUR_MS);
      await advance(harness, 0);
      expect(harness.clock.tick).toBe(GAME_START + 60);
    });
  });

  describe('deadline after closing (TS §3.7)', () => {
    it('stores hiddenSince and catches up to the deadline, then stays paused', async () => {
      // Hidden for 30 min in real time (custom speed `realtime`), then closed; deadline 60 min.
      const first = reload();
      await running(first, '1h', { mode: 'custom-speed', speed: 'realtime', pauseAfter: 60 });
      const hiddenAt = first.timeline.now();
      await first.send('setVisibility', { visible: false });
      expect((await storedClock())?.hiddenSince).toBe(hiddenAt);
      await advance(first, 30 * MINUTE_MS);
      await first.send('unloadPlayer', {});
      const closed = (await storedClock()) as StoredClock;
      expect(closed).toMatchObject({ tick: GAME_START + 30, hiddenSince: hiddenAt });

      // Two hours later: the deadline at hiddenAt + 60 min ends the catch-up 30 min after closing.
      const second = reload({ startMs: closed.lastSeenAt + 2 * HOUR_MS });
      await second.send('loadPlayer', MINI_PLAYER);
      await runUntil(second, () => catchUpDone(second));
      await nextPass(second);
      expect(catchUps(second).at(-1)).toMatchObject({ done: 30, total: 30 });
      expect(second.clock).toMatchObject({ tick: GAME_START + 60, paused: true, visible: true });
      await advance(second, MINUTE_MS);
      expect(second.clock.tick).toBe(GAME_START + 60);
      expect(await storedClock()).toMatchObject({ tick: GAME_START + 60, paused: true });
      expect((await storedClock())?.hiddenSince).toBeUndefined();
    });

    it('continues the stored deadline when loaded while hidden', async () => {
      const first = reload();
      await running(first, '1h', { mode: 'custom-speed', speed: 'realtime', pauseAfter: 60 });
      await first.send('setVisibility', { visible: false });
      await advance(first, 30 * MINUTE_MS);
      await first.send('unloadPlayer', {});
      const closed = (await storedClock()) as StoredClock;

      // Loaded hidden 10 min later: 10 ticks to catch up, then 20 min live up to the deadline.
      const second = reload({ startMs: closed.lastSeenAt + 10 * MINUTE_MS });
      await second.send('setVisibility', { visible: false });
      await second.send('loadPlayer', MINI_PLAYER);
      await runUntil(second, () => catchUpDone(second));
      await nextPass(second);
      expect(second.clock).toMatchObject({ tick: GAME_START + 40, paused: false });
      await advance(second, 20 * MINUTE_MS);
      await nextPass(second);
      expect(second.clock).toMatchObject({ tick: GAME_START + 60, paused: true });
    });

    it('pauses at once when the deadline ran out before the stored tick', async () => {
      const first = reload();
      await running(first, '1h', { mode: 'custom-speed', speed: 'realtime', pauseAfter: 15 });
      await first.send('setVisibility', { visible: false });
      // The live pause would have come at 15 min; the tab is closed before the pass.
      first.timeline.suspend(30 * MINUTE_MS);
      await first.send('unloadPlayer', {});
      const closed = (await storedClock()) as StoredClock;

      const second = reload({ startMs: closed.lastSeenAt + HOUR_MS });
      await second.send('loadPlayer', MINI_PLAYER);
      await nextPass(second);
      expect(catchUps(second)).toEqual([]);
      expect(second.clock).toMatchObject({ tick: closed.tick, paused: true });
    });

    it('keeps the deadline of an interrupted catch-up', async () => {
      const first = reload();
      await running(first, '1h', { mode: 'realtime', pauseAfter: 480 });
      await advance(first, SECOND_MS);
      await first.send('unloadPlayer', {});
      const closed = (await storedClock()) as StoredClock;

      // Ten hours later the catch-up runs to the deadline, 480 ticks past the bank run at 06:00,
      // and is interrupted.
      const second = reload(
        { startMs: closed.lastSeenAt + 10 * HOUR_MS },
        { ...LONG, passBudgetMs: 0 },
      );
      await second.send('loadPlayer', MINI_PLAYER);
      second.timeline.step();
      await second.send('unloadPlayer', {});
      const interrupted = (await storedClock()) as StoredClock;
      expect(interrupted.tick).toBeLessThan(closed.tick + 480);
      expect(interrupted.paused).toBe(false);

      // Five more hours later: the same target, then paused.
      const third = reload({ startMs: second.timeline.now() + 5 * HOUR_MS });
      await third.send('loadPlayer', MINI_PLAYER);
      await runUntil(third, () => catchUpDone(third));
      await nextPass(third);
      expect(third.clock).toMatchObject({ tick: closed.tick + 480, paused: true });
    });
  });

  describe('auto-pause while hidden (E-35)', () => {
    it('pauses at the critical notification in keep-speed', async () => {
      const harness = new HostHarness({ config: FINE_HIDDEN });
      await running(harness, '1h', { mode: 'keep-speed' }, OVERDRAWN);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 10 * SECOND_MS);
      await advance(harness, 100);
      expect(harness.clock).toMatchObject({
        tick: BANK_RUN,
        paused: true,
        visible: false,
        autoPause: { seq: 2, code: 'overdraft-limit-exceeded' },
      });
    });

    it('ends a jump at the critical notification in custom-speed', async () => {
      const harness = new HostHarness({ config: FINE_HIDDEN });
      await harness.send('loadPlayer', OVERDRAWN);
      await harness.send('setBackgroundMode', { mode: 'custom-speed' });
      await harness.send('setVisibility', { visible: false });
      await harness.send('jumpTo', { target: { kind: 'next-month' } });
      await runUntil(harness, () =>
        harness.progress.some(({ kind, state }) => kind === 'jump' && state !== 'running'),
      );
      await advance(harness, 100);
      expect(harness.progress.at(-1)).toMatchObject({ kind: 'jump', state: 'cancelled' });
      expect(harness.clock).toMatchObject({ tick: BANK_RUN, paused: true });
    });

    it('does not pause in realtime and reports the notifications when visible again', async () => {
      // One pass every 4 s keeps six hours of real time short; below the gap threshold of 5 s.
      const harness = new HostHarness({
        config: { loopIntervalMs: 4 * SECOND_MS, hiddenClockPerSecond: 100 },
      });
      await running(harness, '1h', { mode: 'realtime' }, OVERDRAWN);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 7 * HOUR_MS);
      expect(harness.clock).toMatchObject({ tick: GAME_START + 7 * 60, paused: false });
      expect(harness.clock.autoPause).toBeUndefined();

      await harness.send('setVisibility', { visible: true });
      const [report] = harness.events('report').map(({ payload }) => payload);
      expect(report.warnings.map(({ code, tick }) => [code, tick])).toEqual([
        ['account-uncovered', BANK_RUN],
        ['overdraft-limit-exceeded', BANK_RUN],
      ]);
    });
  });

  describe('events while hidden', () => {
    it('sends no quotes and at most one clock event per second while hidden', async () => {
      const harness = new HostHarness({ config: FINE });
      await running(harness, '1h', { mode: 'keep-speed' });
      await harness.send('subscribe', { series: [0], movers: true });
      await advance(harness, SECOND_MS);
      await harness.send('setVisibility', { visible: false });
      const hiddenAt = harness.timeline.now();
      await advance(harness, 5 * SECOND_MS);

      const after = (type: 'clock' | 'quotes' | 'movers'): number[] =>
        harness
          .events(type)
          .map(({ atMs }) => atMs)
          .filter((atMs) => atMs > hiddenAt);
      expect(after('quotes')).toEqual([]);
      expect(after('movers')).toEqual([]);
      const clocks = after('clock');
      expect(clocks.length).toBeGreaterThanOrEqual(4);
      expect(clocks.every((atMs, n) => n === 0 || atMs - clocks[n - 1] >= SECOND_MS)).toBe(true);

      await harness.send('setVisibility', { visible: true });
      expect(harness.quotes.tick).toBe(harness.clock.tick);
      // 6 s at 1 h/s, visible or hidden in keep-speed.
      expect(harness.clock.tick).toBe(GAME_START + 6 * 60);
    });
  });
});
