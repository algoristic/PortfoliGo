import fc from 'fast-check';

import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { GameEngine } from './game-engine';
import { GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { BACKGROUND_MODES } from './models/game-state.model';
import { replayCommands } from './replay';
import { MiniGame, miniGame } from './testing/mini-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Determinism contract of the engine (TS §4.5 rule 5, §4.6) as properties on the mini world:
// any split of the ticks equals one run; snapshot, restore and replay equal an uninterrupted run.

/** End of the runs: three months after the start, across two month starts. */
const END_TICK = dateTimeToTick({ year: 2030, month: 7, day: 1 }) - 1;
/** Longest segment that a run walks with `step()`, so that a run stays cheap. */
const MAX_STEPPED_TICKS = 3 * TICKS_PER_DAY;

const arbRunTick = (): fc.Arbitrary<number> => fc.integer({ min: GAME_START_TICK, max: END_TICK });

/** Commands at random ticks in log order (ascending tick, stable). */
const arbCommands = (): fc.Arbitrary<GameCommand[]> =>
  fc
    .array(fc.record({ tick: arbRunTick(), mode: fc.constantFrom(...BACKGROUND_MODES) }), {
      maxLength: 6,
    })
    .map((drafts) =>
      drafts
        .map((draft, n) => ({ ...draft, id: `cmd-${n}`, type: 'setBackgroundMode' as const }))
        .sort((a, b) => a.tick - b.tick),
    );

interface Reference {
  snapshot: ReturnType<GameEngine['snapshot']>;
  events: EngineEvent[];
}

describe('GameEngine properties', () => {
  let mini: MiniGame;

  beforeAll(() => {
    mini = miniGame(TEST_SEEDS.mini);
  });

  function restoreStart(): GameEngine {
    return GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
  }

  /** One uninterrupted run with the commands applied at their ticks. */
  function referenceRun(commands: readonly GameCommand[]): Reference {
    const engine = restoreStart();
    replayCommands(engine, commands, END_TICK);
    return { snapshot: engine.snapshot(), events: engine.drainEvents() };
  }

  it('ends in the same state with the same events for any split of the ticks', () => {
    const arbSegment = fc.record({
      tick: arbRunTick(),
      mode: fc.constantFrom('runUntil', 'yielding', 'step'),
      yieldEvery: fc.integer({ min: 1, max: 5 }),
    });
    fc.assert(
      fc.property(arbCommands(), fc.array(arbSegment, { maxLength: 8 }), (commands, segments) => {
        const reference = referenceRun(commands);
        const engine = restoreStart();
        const events: EngineEvent[] = [];
        const targets = [
          ...segments,
          ...commands.map((command) => ({ tick: command.tick, mode: 'runUntil', yieldEvery: 1 })),
          { tick: END_TICK, mode: 'runUntil', yieldEvery: 1 },
        ].sort((a, b) => a.tick - b.tick);
        let next = 0;
        for (const { tick, mode, yieldEvery } of targets) {
          if (mode === 'step' && tick - engine.tick <= MAX_STEPPED_TICKS) {
            while (engine.tick < tick) {
              engine.step();
            }
          } else if (mode === 'yielding') {
            let calls = 0;
            while (!engine.runUntil(tick, () => ++calls % yieldEvery === 0)) {
              events.push(...engine.drainEvents());
            }
          } else {
            engine.runUntil(tick);
          }
          while (next < commands.length && commands[next].tick === engine.tick) {
            expect(engine.applyCommand(commands[next++])).toEqual({ ok: true });
          }
          events.push(...engine.drainEvents());
        }
        expect(next).toBe(commands.length);
        expect(engine.snapshot()).toEqual(reference.snapshot);
        expect(events).toEqual(reference.events);
      }),
      { numRuns: 15 },
    );
  });

  it('continues a restored snapshot with replayed commands like an uninterrupted run', () => {
    fc.assert(
      fc.property(
        arbCommands(),
        arbRunTick(),
        fc.nat(),
        fc.constantFrom('none', 'all', 'until-snapshot', 'first-months'),
        (commands, snapshotTick, appliedAtSnapshot, monthStarts) => {
          const live = restoreStart();
          let next = 0;
          while (next < commands.length && commands[next].tick < snapshotTick) {
            live.runUntil(commands[next].tick);
            live.applyCommand(commands[next++]);
          }
          live.runUntil(snapshotTick);
          // Some commands of the snapshot tick may already be in the snapshot.
          const atSnapshot = commands.filter((command) => command.tick === snapshotTick).length;
          for (let n = 0; n < appliedAtSnapshot % (atSnapshot + 1); n++) {
            live.applyCommand(commands[next++]);
          }
          live.drainEvents();
          const snapshot = live.snapshot();
          const storedMonthStarts = live.monthStartsAfter(-1);
          replayCommands(live, commands.slice(next), END_TICK);
          const after = live.drainEvents();

          const entries = {
            none: [],
            all: live.monthStartsAfter(-1),
            'until-snapshot': storedMonthStarts,
            'first-months': storedMonthStarts.slice(0, 7),
          }[monthStarts];
          const restored = GameEngine.restore(mini.world, snapshot, { monthStarts: entries });
          replayCommands(restored, commands, END_TICK);

          expect(restored.snapshot()).toEqual(live.snapshot());
          expect(restored.drainEvents()).toEqual(after);
          expect(restored.monthStartsAfter(-1)).toEqual(live.monthStartsAfter(-1));
          expect(referenceRun(commands).snapshot).toEqual(live.snapshot());
        },
      ),
      { numRuns: 15 },
    );
  });
});
