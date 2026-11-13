import fc from 'fast-check';

import { journalBalances } from '@app/banking/domain/ledger-logic';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { BACKGROUND_MODES, GameSnapshot } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { replayCommands } from './replay';
import { startBankingGame, withBooks, withTestBanks } from './testing/banking-game';
import { MINI_START_CONDITIONS } from './testing/mini-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Determinism contract of the engine (TS §4.5 rule 5, §4.6) as properties on the mini world:
// any split of the ticks equals one run; snapshot, restore and replay equal an uninterrupted run.
// Both include the journal, and the cached balances always equal the sums of the journal (TS §7.2).
// The player has accounts at the test banks that book every kind of household transaction (TS §7.4):
// salary and living costs, account fees, overdraft interest beyond the limit, monthly savings
// interest with tax, quarterly savings interest and debit interest on a clearing account.

/** End of the runs: four months after the start, across three month starts and a quarter. */
const END_TICK = dateTimeToTick({ year: 2030, month: 8, day: 1 }) - 1;
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
  journal: Transaction[];
}

describe('GameEngine properties', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: readonly FactorStateEntry[];

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), MINI_START_CONDITIONS);
    world = withTestBanks(engine.world);
    start = withBooks(engine.snapshot(), {
      accounts: [
        { kind: 'savings', bankId: 'b1', balance: 30_000_000 },
        { kind: 'savings', bankId: 'b2', balance: 1_000_000 },
        { kind: 'clearing', bankId: 'b3', balance: -200_000 },
      ],
      balances: { 'acc-1': -600_000 },
    });
    monthStarts = engine.monthStartsAfter(-1);
  });

  function restoreStart(): GameEngine {
    return GameEngine.restore(world, start, { monthStarts });
  }

  /** One uninterrupted run with the commands applied at their ticks. */
  function referenceRun(commands: readonly GameCommand[]): Reference {
    const engine = restoreStart();
    replayCommands(engine, commands, END_TICK);
    return {
      snapshot: engine.snapshot(),
      events: engine.drainEvents(),
      journal: engine.drainTransactions(),
    };
  }

  /** The balances of the start (set without transactions) plus the sums of the journal. */
  function expectBalancesOfJournal(
    snapshot: ReturnType<GameEngine['snapshot']>,
    journal: readonly Transaction[],
  ): void {
    const sums = journalBalances(journal);
    const expected = new Map(
      [...start.player.balances].map(([id, balance]) => [id, balance + (sums.get(id) ?? 0)]),
    );
    expect(snapshot.player.balances).toEqual(expected);
  }

  it('runs through every kind of household transaction', () => {
    const { journal, events } = referenceRun([]);
    const types = new Set(journal.map(({ type }) => type));
    expect([...types].sort()).toEqual([
      'account-fee',
      'credit-interest',
      'debit-interest',
      'living-costs',
      'overdraft-interest',
      'salary',
      'tax',
    ]);
    const credited = events.flatMap((event) =>
      event.type === 'interest-credited' ? [event.accountId] : [],
    );
    expect(credited.filter((id) => id === 'acc-3')).toHaveLength(1);
  });

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
        const journal: Transaction[] = [];
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
              journal.push(...engine.drainTransactions());
            }
          } else {
            engine.runUntil(tick);
          }
          while (next < commands.length && commands[next].tick === engine.tick) {
            expect(engine.applyCommand(commands[next++])).toEqual({ ok: true });
          }
          events.push(...engine.drainEvents());
          journal.push(...engine.drainTransactions());
        }
        expect(next).toBe(commands.length);
        expect(engine.snapshot()).toEqual(reference.snapshot);
        expect(events).toEqual(reference.events);
        expect(journal).toEqual(reference.journal);
        expectBalancesOfJournal(reference.snapshot, reference.journal);
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
          const before = live.drainTransactions();
          const snapshot = live.snapshot();
          const storedMonthStarts = live.monthStartsAfter(-1);
          replayCommands(live, commands.slice(next), END_TICK);
          const after = live.drainEvents();
          const journalAfter = live.drainTransactions();

          const entries = {
            none: [],
            all: live.monthStartsAfter(-1),
            'until-snapshot': storedMonthStarts,
            'first-months': storedMonthStarts.slice(0, 7),
          }[monthStarts];
          const restored = GameEngine.restore(world, snapshot, { monthStarts: entries });
          replayCommands(restored, commands, END_TICK);

          expect(restored.snapshot()).toEqual(live.snapshot());
          expect(restored.drainEvents()).toEqual(after);
          expect(restored.drainTransactions()).toEqual(journalAfter);
          expect(restored.monthStartsAfter(-1)).toEqual(live.monthStartsAfter(-1));
          const reference = referenceRun(commands);
          expect(reference.snapshot).toEqual(live.snapshot());
          expect([...before, ...journalAfter]).toEqual(reference.journal);
          expectBalancesOfJournal(live.snapshot(), reference.journal);
        },
      ),
      { numRuns: 15 },
    );
  });
});
