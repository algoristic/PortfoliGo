import fc from 'fast-check';

import { SpeedId, SPEEDS } from '@app/clock/domain/models/speed.model';

import { backlogMs, ClockPacer, effectiveSpeed, OVERLOAD_BACKLOG_MS } from './clock-pacing-logic';
import { ClockSettings, PacedRunner } from './models/engine-clock.model';
import { BACKGROUND_MODES } from './models/game-state.model';

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

const running = (speed: SpeedId): ClockSettings => ({
  speed,
  paused: false,
  visible: true,
  backgroundMode: 'realtime',
});

const arbSpeed = (): fc.Arbitrary<SpeedId> => fc.constantFrom(...SPEEDS.map((speed) => speed.id));
const arbSettings = (): fc.Arbitrary<ClockSettings> =>
  fc.record({
    speed: arbSpeed(),
    paused: fc.boolean(),
    visible: fc.boolean(),
    backgroundMode: fc.constantFrom(...BACKGROUND_MODES),
  });

describe('effectiveSpeed', () => {
  // TS §3.6: a pause of the player stays a pause; hidden, `backgroundMode` decides.
  it.each([
    [false, true, 'realtime', '1h'],
    [false, true, 'pause', '1h'],
    [false, false, 'realtime', 'realtime'],
    [false, false, 'pause', null],
    [true, true, 'realtime', null],
    [true, true, 'pause', null],
    [true, false, 'realtime', null],
    [true, false, 'pause', null],
  ] as const)(
    'returns %s/%s/%s → %s for the chosen speed 1h',
    (paused, visible, backgroundMode, expected) => {
      expect(effectiveSpeed({ speed: '1h', paused, visible, backgroundMode })).toBe(expected);
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
