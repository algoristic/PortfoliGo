import fc from 'fast-check';

import { SpeedId, SPEEDS } from '@app/clock/domain/models/speed.model';

import {
  backlogMs,
  ClockPacer,
  effectiveSpeed,
  OVERLOAD_BACKLOG_MS,
  TICK_GAP_THRESHOLD_MS,
} from './clock-pacing-logic';
import { ClockSettings, PacedRunner } from './models/engine-clock.model';
import {
  BACKGROUND_MODES,
  BACKGROUND_PAUSE_AFTER_MINUTES,
  BackgroundMode,
  BackgroundPauseAfter,
} from './models/game-state.model';

const START_TICK = 5_389_920;
const START_MS = 1_794_441_600_000;

/** Processes every tick on its way and records it; yields when the callback asks. */
class RecordingRunner implements PacedRunner {
  tick: number;
  readonly processed: number[] = [];

  constructor(tick: number) {
    this.tick = tick;
  }

  runUntil(targetTick: number, shouldYield: () => boolean): boolean {
    while (this.tick < targetTick) {
      this.tick++;
      this.processed.push(this.tick);
      if (this.tick < targetTick && shouldYield()) {
        return false;
      }
    }
    return true;
  }
}

/** Jumps to every target at once; for long runs at fast speeds. */
class JumpingRunner implements PacedRunner {
  tick: number;

  constructor(tick: number) {
    this.tick = tick;
  }

  runUntil(targetTick: number): boolean {
    this.tick = Math.max(this.tick, targetTick);
    return true;
  }
}

/** Passes every `stepMs` after `fromMs` up to `toMs`; returns the tick of the first `pauseDue`. */
function passEvery(
  pacer: ClockPacer,
  runner: PacedRunner,
  fromMs: number,
  toMs: number,
  stepMs = TICK_GAP_THRESHOLD_MS,
): number | null {
  let pausedAt: number | null = null;
  for (let nowMs = fromMs + stepMs; nowMs <= toMs; nowMs += stepMs) {
    if (pacer.pass(runner, nowMs, () => false).pauseDue && pausedAt === null) {
      pausedAt = runner.tick;
    }
  }
  return pausedAt;
}

/** Game seconds per real second of a speed, read from the speed list (TS §3.4). */
function gameSecondsPerSecond(id: SpeedId): number {
  return SPEEDS.filter((speed) => speed.id === id)[0].gameSecondsPerSecond;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const running = (speed: SpeedId): ClockSettings => ({
  speed,
  paused: false,
  visible: true,
  backgroundMode: 'realtime',
  backgroundSpeed: '1d',
  backgroundPauseAfter: null,
});

const hidden = (
  backgroundMode: BackgroundMode,
  speed: SpeedId,
  backgroundSpeed: SpeedId,
  backgroundPauseAfter: BackgroundPauseAfter,
): ClockSettings => ({
  speed,
  paused: false,
  visible: false,
  backgroundMode,
  backgroundSpeed,
  backgroundPauseAfter,
});

const arbSpeed = (): fc.Arbitrary<SpeedId> => fc.constantFrom(...SPEEDS.map((speed) => speed.id));
const arbSettings = (): fc.Arbitrary<ClockSettings> =>
  fc.record({
    speed: arbSpeed(),
    paused: fc.boolean(),
    visible: fc.boolean(),
    backgroundMode: fc.constantFrom(...BACKGROUND_MODES),
    backgroundSpeed: arbSpeed(),
    backgroundPauseAfter: fc.constantFrom(null, ...BACKGROUND_PAUSE_AFTER_MINUTES),
  });

describe('effectiveSpeed', () => {
  // TS §3.6, table "Wirksame Geschwindigkeit": chosen speed 1 h/s, `backgroundSpeed` 1 d/s.
  it.each([
    [false, true, 'realtime', '1h'],
    [false, true, 'pause', '1h'],
    [false, true, 'keep-speed', '1h'],
    [false, true, 'custom-speed', '1h'],
    [false, false, 'realtime', 'realtime'],
    [false, false, 'pause', null],
    [false, false, 'keep-speed', '1h'],
    [false, false, 'custom-speed', '1d'],
    [true, true, 'realtime', null],
    [true, true, 'keep-speed', null],
    [true, false, 'realtime', null],
    [true, false, 'pause', null],
    [true, false, 'keep-speed', null],
    [true, false, 'custom-speed', null],
  ] as const)(
    'returns %s/%s/%s → %s for the chosen speed 1h',
    (paused, visible, backgroundMode, expected) => {
      expect(
        effectiveSpeed({
          speed: '1h',
          paused,
          visible,
          backgroundMode,
          backgroundSpeed: '1d',
          backgroundPauseAfter: 30,
        }),
      ).toBe(expected);
    },
  );
});

describe('backlogMs', () => {
  // TS §3.4: 1 w/s = 10,080 ticks per second, real time = 1/60 tick per second.
  it.each([
    [20_160, '1w', 2_000],
    [10_080, '1w', 1_000],
    [2, 'realtime', 120_000],
    [90, '1h', 1_500],
    [0, '1h', 0],
  ] as const)('is %d ticks at %s → %d ms', (behind, speed, expected) => {
    expect(backlogMs(START_TICK + behind, START_TICK, speed)).toBe(expected);
  });

  it('is 0 while the game rests', () => {
    expect(backlogMs(START_TICK + 1_000, START_TICK, null)).toBe(0);
  });

  it('is 0 when the runner is ahead of the target', () => {
    expect(backlogMs(START_TICK, START_TICK + 5, '1h')).toBe(0);
  });
});

describe('ClockPacer', () => {
  describe('target', () => {
    // TS §3.4: ticks per second of every speed.
    it.each([
      ['realtime', 59_999, 0],
      ['realtime', 60_000, 1],
      ['1min', 999, 0],
      ['1min', 1_000, 1],
      ['10min', 1_500, 15],
      ['1h', 1_500, 90],
      ['2h', 1_000, 120],
      ['4h', 250, 60],
      ['1d', 1_000, 1_440],
      ['1w', 2_000, 20_160],
    ] as const)('runs %s for %d ms → %d ticks', (speed, elapsedMs, ticks) => {
      const pacer = new ClockPacer(running(speed), START_TICK, START_MS);
      expect(pacer.target(START_MS + elapsedMs)).toBe(START_TICK + ticks);
    });

    it('stays at the anchor while paused', () => {
      const pacer = new ClockPacer({ ...running('1w'), paused: true }, START_TICK, START_MS);
      expect(pacer.target(START_MS + 3_600_000)).toBe(START_TICK);
    });

    it('runs in real time while hidden with background mode realtime', () => {
      const pacer = new ClockPacer({ ...running('1w'), visible: false }, START_TICK, START_MS);
      expect(pacer.target(START_MS + 120_000)).toBe(START_TICK + 2);
    });

    it('makes no progress when the wall clock is set back', () => {
      const pacer = new ClockPacer(running('1h'), START_TICK, START_MS);
      expect(pacer.target(START_MS - 10_000)).toBe(START_TICK);
    });
  });

  describe('update', () => {
    it('sets a new anchor at the given tick and keeps the other settings', () => {
      const pacer = new ClockPacer(running('1h'), START_TICK, START_MS);
      pacer.update({ speed: '1min' }, START_TICK + 590, START_MS + 10_000);
      expect(pacer.settings).toEqual(running('1min'));
      expect(pacer.anchor).toEqual({ tick: START_TICK + 590, realTimeMs: START_MS + 10_000 });
      expect(pacer.target(START_MS + 11_000)).toBe(START_TICK + 591);
    });
  });

  describe('pass', () => {
    it('runs to the target and is not overloaded when it got there', () => {
      const pacer = new ClockPacer(running('1h'), START_TICK, START_MS);
      const runner = new RecordingRunner(START_TICK);
      const result = pacer.pass(runner, START_MS + 1_000, () => false);
      expect(result).toEqual({
        target: START_TICK + 60,
        reached: true,
        backlogMs: 0,
        overloaded: false,
        pauseDue: false,
      });
      expect(runner.tick).toBe(START_TICK + 60);
    });

    it('reports overloaded only when more than two seconds behind', () => {
      const pacer = new ClockPacer(running('1w'), START_TICK, START_MS);
      // 2000.1 ms at 1 w/s → target + 20,161; one tick done → 20,160 ticks = 2000 ms behind.
      const atLimit = pacer.pass(new RecordingRunner(START_TICK), START_MS + 2_000.1, () => true);
      expect(atLimit.reached).toBe(false);
      expect(atLimit.backlogMs).toBe(OVERLOAD_BACKLOG_MS);
      expect(atLimit.overloaded).toBe(false);
      const beyond = pacer.pass(new RecordingRunner(START_TICK), START_MS + 2_001, () => true);
      expect(beyond.overloaded).toBe(true);
    });

    it('never moves the runner back when the target lies behind it', () => {
      const pacer = new ClockPacer({ ...running('1h'), paused: true }, START_TICK, START_MS);
      const runner = new RecordingRunner(START_TICK + 10);
      expect(pacer.pass(runner, START_MS + 1_000, () => false).reached).toBe(true);
      expect(runner.tick).toBe(START_TICK + 10);
    });
  });

  describe('backgroundPauseAfter', () => {
    // TS §3.6, examples "Frist verborgen": hidden from tick T at H, a pass every 5 s for 2 h.
    it.each([
      ['realtime', '1h', '1d', 30, 30],
      ['keep-speed', '1h', '1d', 15, 54_000],
      ['keep-speed', '1min', '1d', 60, 3_600],
      ['custom-speed', '1min', '10min', 60, 36_000],
      ['custom-speed', '1h', '1d', 15, 1_296_000],
    ] as const)(
      'pauses %s (chosen %s, background %s) after %d min at T + %d',
      (mode, speed, backgroundSpeed, pauseAfter, ticks) => {
        const pacer = new ClockPacer(
          hidden(mode, speed, backgroundSpeed, pauseAfter),
          START_TICK,
          START_MS,
        );
        const runner = new JumpingRunner(START_TICK);
        expect(pacer.pauseAt).toBe(START_MS + pauseAfter * MINUTE_MS);
        expect(passEvery(pacer, runner, START_MS, START_MS + 2 * HOUR_MS)).toBe(START_TICK + ticks);
        expect(runner.tick).toBe(START_TICK + ticks);
      },
    );

    it('counts from the start of hiding, not from a new anchor of a command', () => {
      const pacer = new ClockPacer(hidden('keep-speed', '1h', '1d', 30), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      passEvery(pacer, runner, START_MS, START_MS + 10 * MINUTE_MS);
      expect(runner.tick).toBe(START_TICK + 36_000);
      pacer.reanchor(runner.tick, START_MS + 10 * MINUTE_MS);
      const pausedAt = passEvery(pacer, runner, START_MS + 10 * MINUTE_MS, START_MS + HOUR_MS);
      expect(pausedAt).toBe(START_TICK + 108_000);
    });

    it('lets a freeze across the deadline count only in real time up to the deadline', () => {
      const pacer = new ClockPacer(hidden('keep-speed', '1h', '1d', 30), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      passEvery(pacer, runner, START_MS, START_MS + 10 * MINUTE_MS);
      pacer.freeze(START_MS + 10 * MINUTE_MS);
      pacer.resume(START_MS + HOUR_MS);
      const result = pacer.pass(runner, START_MS + HOUR_MS, () => false);
      expect(result.pauseDue).toBe(true);
      expect(runner.tick).toBe(START_TICK + 36_020);
    });

    it('never pauses without a deadline or in background mode pause', () => {
      const off = new ClockPacer(hidden('keep-speed', '1h', '1d', null), START_TICK, START_MS);
      const offRunner = new JumpingRunner(START_TICK);
      expect(off.pauseAt).toBeNull();
      expect(passEvery(off, offRunner, START_MS, START_MS + 2 * HOUR_MS)).toBeNull();
      expect(offRunner.tick).toBe(START_TICK + 432_000);

      const resting = new ClockPacer(hidden('pause', '1h', '1d', 30), START_TICK, START_MS);
      const restingRunner = new JumpingRunner(START_TICK);
      expect(resting.pauseAt).toBeNull();
      expect(passEvery(resting, restingRunner, START_MS, START_MS + 2 * HOUR_MS)).toBeNull();
      expect(restingRunner.tick).toBe(START_TICK);
    });

    it('drops the deadline when visible and starts it anew when hidden again', () => {
      const pacer = new ClockPacer(
        { ...running('1min'), backgroundMode: 'realtime', backgroundPauseAfter: 30 },
        START_TICK,
        START_MS,
      );
      expect(pacer.hiddenSince).toBeNull();
      expect(pacer.pauseAt).toBeNull();
      pacer.update({ visible: false }, START_TICK, START_MS + MINUTE_MS);
      expect(pacer.hiddenSince).toBe(START_MS + MINUTE_MS);
      expect(pacer.pauseAt).toBe(START_MS + 31 * MINUTE_MS);
      pacer.update({ visible: true }, START_TICK + 20, START_MS + 21 * MINUTE_MS);
      expect(pacer.hiddenSince).toBeNull();
      const runner = new JumpingRunner(START_TICK + 20);
      expect(passEvery(pacer, runner, START_MS + 21 * MINUTE_MS, START_MS + HOUR_MS)).toBeNull();
      pacer.update({ visible: false }, runner.tick, START_MS + 2 * HOUR_MS);
      expect(pacer.pauseAt).toBe(START_MS + 2 * HOUR_MS + 30 * MINUTE_MS);
      // A further change while hidden keeps the start of hiding.
      pacer.update({ speed: '1h' }, runner.tick, START_MS + 2 * HOUR_MS + MINUTE_MS);
      expect(pacer.hiddenSince).toBe(START_MS + 2 * HOUR_MS);
    });

    it('continues a stored start of hiding', () => {
      const settings = hidden('realtime', '1h', '1d', 15);
      const pacer = new ClockPacer(settings, START_TICK, START_MS, START_MS - 10 * MINUTE_MS);
      expect(pacer.hiddenSince).toBe(START_MS - 10 * MINUTE_MS);
      expect(pacer.pauseAt).toBe(START_MS + 5 * MINUTE_MS);
    });

    it('does not report a due pause before the runner reached the tick of the deadline', () => {
      const pacer = new ClockPacer(hidden('keep-speed', '1w', '1d', 15), START_TICK, START_MS);
      const runner = new RecordingRunner(START_TICK);
      const result = pacer.pass(runner, START_MS + 15 * MINUTE_MS, () => true);
      expect(result.reached).toBe(false);
      expect(result.pauseDue).toBe(false);
    });
  });

  describe('gaps', () => {
    // TS §3.6, examples "Lücken im Takt": 1 w/s, last pass at t0 with target T.
    it.each([
      ['4 s', [4_000], 40_320],
      ['5 s', [5_000], 50_400],
      ['6 s', [6_000], 0],
      ['1 h', [HOUR_MS], 60],
      ['1 h, then 1 s', [HOUR_MS, HOUR_MS + 1_000], 10_140],
      ['40 s twice', [40_000, 80_000], 1],
    ] as const)('reaches T + %s → %d ticks', (_name, passes, ticks) => {
      const pacer = new ClockPacer(running('1w'), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      for (const offsetMs of passes) {
        pacer.pass(runner, START_MS + offsetMs, () => false);
      }
      expect(runner.tick).toBe(START_TICK + ticks);
    });

    it('counts a freeze as a gap regardless of its length', () => {
      const pacer = new ClockPacer(running('1w'), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      pacer.freeze(START_MS + 1_000);
      pacer.resume(START_MS + 3_000);
      pacer.pass(runner, START_MS + 3_000, () => false);
      expect(runner.tick).toBe(START_TICK + 10_080);
    });

    it('treats a pass after a freeze without resume as the resume', () => {
      const pacer = new ClockPacer(running('1w'), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      pacer.freeze(START_MS + 1_000);
      pacer.pass(runner, START_MS + 3_000, () => false);
      expect(runner.tick).toBe(START_TICK + 10_080);
    });

    it('changes nothing at real-time speed', () => {
      const pacer = new ClockPacer(running('realtime'), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      pacer.pass(runner, START_MS + 59_000, () => false);
      pacer.pass(runner, START_MS + HOUR_MS, () => false);
      expect(runner.tick).toBe(START_TICK + 60);
    });

    it('starts no gap after a new anchor', () => {
      const pacer = new ClockPacer(running('1w'), START_TICK, START_MS);
      const runner = new JumpingRunner(START_TICK);
      pacer.reanchor(START_TICK, START_MS + HOUR_MS);
      pacer.pass(runner, START_MS + HOUR_MS + 1_000, () => false);
      expect(runner.tick).toBe(START_TICK + 10_080);
    });
  });

  describe('properties', () => {
    it('reaches the same tick for any split of the real time into passes', () => {
      fc.assert(
        fc.property(
          arbSettings(),
          fc.uniqueArray(fc.integer({ min: 1, max: 3_000 }), { maxLength: 12 }),
          fc.integer({ min: 1, max: 3_000 }),
          fc.infiniteStream(fc.boolean()),
          (settings, splits, endMs, yields) => {
            const split = new ClockPacer(settings, START_TICK, START_MS);
            const runner = new RecordingRunner(START_TICK);
            for (const ms of [...splits].filter((ms) => ms < endMs).sort((a, b) => a - b)) {
              split.pass(runner, START_MS + ms, () => yields.next().value);
            }
            split.pass(runner, START_MS + endMs, () => false);

            const single = new ClockPacer(settings, START_TICK, START_MS);
            const once = new RecordingRunner(START_TICK);
            single.pass(once, START_MS + endMs, () => false);

            expect(runner.tick).toBe(once.tick);
            expect(runner.processed).toEqual(once.processed);
          },
        ),
      );
    });

    it('never brings more game time for gaps than real time', () => {
      fc.assert(
        fc.property(
          arbSettings(),
          fc.array(
            fc.oneof(
              fc.integer({ min: 0, max: TICK_GAP_THRESHOLD_MS }),
              fc.integer({ min: TICK_GAP_THRESHOLD_MS + 1, max: 2 * HOUR_MS }),
            ),
            { maxLength: 30 },
          ),
          (settings, intervals) => {
            const pacer = new ClockPacer(settings, START_TICK, START_MS);
            const runner = new JumpingRunner(START_TICK);
            const speed = effectiveSpeed(settings);
            let nowMs = START_MS;
            let gapMs = 0;
            let steadyMs = 0;
            for (const intervalMs of intervals) {
              nowMs += intervalMs;
              if (intervalMs > TICK_GAP_THRESHOLD_MS) {
                gapMs += intervalMs;
              } else {
                steadyMs += intervalMs;
              }
              pacer.pass(runner, nowMs, () => false);
            }
            const perSecond = speed === null ? 0 : gameSecondsPerSecond(speed);
            const gained = runner.tick - START_TICK;
            expect(gained).toBeLessThanOrEqual(
              Math.floor((steadyMs * perSecond + gapMs * Math.min(perSecond, 1)) / MINUTE_MS),
            );
            if (steadyMs === 0) {
              expect(gained).toBeLessThanOrEqual(Math.floor(gapMs / MINUTE_MS));
            }
          },
        ),
      );
    });

    it('follows the wall clock unchanged while no gap occurs', () => {
      fc.assert(
        fc.property(
          arbSettings().map((settings) => ({ ...settings, backgroundPauseAfter: null })),
          fc.array(fc.integer({ min: 0, max: TICK_GAP_THRESHOLD_MS }), { maxLength: 30 }),
          (settings, intervals) => {
            const pacer = new ClockPacer(settings, START_TICK, START_MS);
            const runner = new JumpingRunner(START_TICK);
            let nowMs = START_MS;
            for (const intervalMs of intervals) {
              nowMs += intervalMs;
              pacer.pass(runner, nowMs, () => false);
            }
            const speed = effectiveSpeed(settings);
            const perSecond = speed === null ? 0 : gameSecondsPerSecond(speed);
            expect(runner.tick).toBe(
              START_TICK + Math.floor(((nowMs - START_MS) * perSecond) / MINUTE_MS),
            );
          },
        ),
      );
    });

    it('never skips a tick across passes and setting changes', () => {
      const arbStep = fc.oneof(
        fc.record({ kind: fc.constant('pass' as const), ms: fc.integer({ min: 0, max: 400 }) }),
        fc.record({ kind: fc.constant('change' as const), change: arbSettings() }),
      );
      fc.assert(
        fc.property(
          arbSettings(),
          fc.array(arbStep, { maxLength: 20 }),
          fc.infiniteStream(fc.boolean()),
          (settings, steps, yields) => {
            const pacer = new ClockPacer(settings, START_TICK, START_MS);
            const runner = new RecordingRunner(START_TICK);
            let nowMs = START_MS;
            for (const step of steps) {
              if (step.kind === 'pass') {
                nowMs += step.ms;
                pacer.pass(runner, nowMs, () => yields.next().value);
              } else {
                pacer.update(step.change, runner.tick, nowMs);
              }
            }
            const last = pacer.pass(runner, nowMs, () => false);
            expect(runner.processed).toEqual(
              Array.from({ length: runner.tick - START_TICK }, (_, i) => START_TICK + i + 1),
            );
            expect(runner.tick).toBe(last.target);
            expect(last.overloaded).toBe(false);
          },
        ),
      );
    });
  });
});
