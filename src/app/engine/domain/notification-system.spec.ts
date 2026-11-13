import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { CalendarDate, Tick } from '@app/clock/domain/models/time.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { GameSnapshot, GameState, StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { replayCommands } from './replay';
import { startBankingGame, TestBooks, withBooks, withTestBanks } from './testing/banking-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Notifications of the engine (TS §12, US-BN-01, US-BN-02, US-ZT-06) with the test banks of
// `testing/banking-game.ts`: limit factor 2 at the home bank `b1`, savings 2 % paid monthly.

function at(date: CalendarDate, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ ...date, hour, minute });
}

const APR_1 = { year: 2030, month: 4, day: 1 };
const MAY_1 = { year: 2030, month: 5, day: 1 };
const JUN_1 = { year: 2030, month: 6, day: 1 };
const JAN_1_2031 = { year: 2031, month: 1, day: 1 };

/** Limit 2 × 2.500 €; living costs of about 6.000 € exceed it at the first bank run. */
const INDEBTED: StartConditions = { startCapital: 0, netIncome: 250_000, livingCosts: 600_000 };
const FUNDED: StartConditions = {
  startCapital: 1_000_000,
  netIncome: 250_000,
  livingCosts: 180_000,
};

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;

interface Started {
  start: GameSnapshot;
  monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
}

function coverage(events: readonly EngineEvent[]): EngineEvent[] {
  return events.filter(
    ({ type }) => type === 'account-uncovered' || type === 'overdraft-limit-exceeded',
  );
}

describe('GameEngine notifications', () => {
  let world: GameWorld;
  let indebted: Started;
  let funded: Started;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    world = createGameWorld(seedKey, mini);
    indebted = started(INDEBTED);
    funded = started(FUNDED);
  });

  function started(start: StartConditions): Started {
    const engine = startBankingGame(world, start);
    return { start: engine.snapshot(), monthStarts: engine.monthStartsAfter(-1) };
  }

  function engineOf(game: Started, books?: TestBooks): GameEngine {
    const snapshot = books === undefined ? game.start : withBooks(game.start, books);
    return GameEngine.restore(withTestBanks(world), snapshot, { monthStarts: game.monthStarts });
  }

  function command(engine: GameEngine, body: WithoutStamp<GameCommand>, id = 'c1'): GameCommand {
    return { ...body, id, tick: engine.tick } as GameCommand;
  }

  describe('US-BN-02, US-ZT-06: overdraft', () => {
    it('creates a warning and a critical notification and stops at the tick of the auto-pause', () => {
      const engine = engineOf(indebted);
      const stopped = engine.runUntil(at(JUN_1), () => engine.autoPauseNotification !== null);
      expect(stopped).toBe(false);
      expect(engine.tick).toBe(at(APR_1, 6));
      const events = coverage(engine.drainEvents());
      const [uncovered, exceeded] = events as Extract<EngineEvent, { balance: number }>[];
      expect(engine.autoPauseNotification).toEqual({
        seq: 2,
        tick: at(APR_1, 6),
        code: 'overdraft-limit-exceeded',
        params: { accountId: 'acc-1', balance: exceeded.balance, limit: 500_000 },
      });
      expect(engine.drainNotifications()).toEqual<GameNotification[]>([
        {
          seq: 1,
          tick: at(APR_1, 6),
          code: 'account-uncovered',
          params: { accountId: 'acc-1', balance: uncovered.balance, limit: 500_000 },
        },
        {
          seq: 2,
          tick: at(APR_1, 6),
          code: 'overdraft-limit-exceeded',
          params: { accountId: 'acc-1', balance: exceeded.balance, limit: 500_000 },
        },
      ]);
      expect(exceeded.balance).toBeLessThan(-500_000);
      expect(engine.autoPauseNotification).toBeNull();
      expect(engine.player.notifications.nextSeq).toBe(3);
    });

    it('gives no auto-pause signal once the player switched it off', () => {
      const engine = engineOf(indebted);
      expect(
        engine.applyCommand(
          command(engine, {
            type: 'setAutoPause',
            code: 'overdraft-limit-exceeded',
            enabled: false,
          }),
        ),
      ).toEqual({ ok: true });
      engine.runUntil(at(APR_1, 6));
      expect(engine.autoPauseNotification).toBeNull();
      expect(engine.drainNotifications().map(({ code }) => code)).toEqual([
        'account-uncovered',
        'overdraft-limit-exceeded',
      ]);
    });

    it('signals the first notification whose code the player switched on', () => {
      const engine = engineOf(indebted);
      engine.applyCommand(
        command(engine, { type: 'setAutoPause', code: 'account-uncovered', enabled: true }),
      );
      engine.runUntil(at(APR_1, 6));
      expect(engine.autoPauseNotification?.code).toBe('account-uncovered');
      expect(engine.player.notifications.autoPause).toEqual({ 'account-uncovered': true });
    });
  });

  describe('month and year end, interest', () => {
    it('reports the closed month with its values and the credit interest with its tax', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'savings', bankId: 'b1', balance: 100_000_000 }],
      });
      engine.runUntil(at(MAY_1, 6));
      const notifications = engine.drainNotifications();
      const april = engine.player.closedMonths.at(-1);
      const credited = engine
        .drainEvents()
        .find((event) => event.type === 'interest-credited') as Extract<
        EngineEvent,
        { type: 'interest-credited' }
      >;
      expect(notifications).toEqual<GameNotification[]>([
        {
          seq: 1,
          tick: at(MAY_1),
          code: 'month-closed',
          params: { year: 2030, month: 4, values: april?.values ?? ({} as never) },
        },
        {
          seq: 2,
          tick: at(MAY_1, 6),
          code: 'interest-credited',
          params: { accountId: 'acc-2', amount: credited.amount, tax: credited.tax },
        },
      ]);
      expect(credited.amount).toBeGreaterThan(0);
    });

    it('reports a tax refund booked with credit interest', () => {
      const snapshot = withBooks(funded.start, {
        accounts: [{ kind: 'savings', bankId: 'b1', balance: 100_000_000 }],
      }) as GameState;
      // Withheld 50,00 € on a year that is in loss now: the next credit interest refunds it.
      snapshot.player.taxYear = { ...snapshot.player.taxYear, income: -1_000_000, withheld: 5_000 };
      const engine = GameEngine.restore(withTestBanks(world), snapshot, {
        monthStarts: funded.monthStarts,
      });
      engine.runUntil(at(MAY_1, 6));
      const refund = engine.drainNotifications().filter(({ code }) => code === 'tax-refund');
      expect(refund).toEqual<GameNotification[]>([
        {
          seq: 3,
          tick: at(MAY_1, 6),
          code: 'tax-refund',
          params: { accountId: 'acc-2', amount: 5_000 },
        },
      ]);
    });

    it('reports the closed tax year with its income and tax', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'savings', bankId: 'b1', balance: 100_000_000 }],
      });
      engine.runUntil(at(JAN_1_2031) - 1);
      const year = engine.player.taxYear;
      engine.runUntil(at(JAN_1_2031));
      const closed = engine.drainNotifications().filter(({ code }) => code === 'year-closed');
      expect(closed).toEqual([
        expect.objectContaining({
          tick: at(JAN_1_2031),
          code: 'year-closed',
          params: { year: 2030, taxableIncome: year.income, taxWithheld: year.withheld },
        }),
      ]);
      expect(year.income).toBeGreaterThan(0);
    });
  });

  describe('commands', () => {
    it('marks notifications read and keeps the state over snapshot, restore and replay', () => {
      const engine = engineOf(indebted);
      engine.runUntil(at(MAY_1, 6));
      engine.drainNotifications();
      const last = engine.player.notifications.nextSeq - 1;
      expect(last).toBeGreaterThanOrEqual(4);
      const commands: GameCommand[] = [
        command(engine, { type: 'markNotificationsRead', seqs: [2] }, 'read-2'),
        command(
          engine,
          { type: 'setAutoPause', code: 'month-closed', enabled: true },
          'pause-month',
        ),
      ];
      const snapshot = engine.snapshot();
      for (const next of commands) {
        expect(engine.applyCommand(next)).toEqual({ ok: true });
      }
      expect(engine.player.notifications).toMatchObject({
        readUpTo: 0,
        readSeqs: [2],
        autoPause: { 'month-closed': true },
      });
      engine.runUntil(at(JUN_1));
      expect(engine.autoPauseNotification?.code).toBe('month-closed');

      const restored = GameEngine.restore(withTestBanks(world), snapshot, {
        monthStarts: indebted.monthStarts,
      });
      replayCommands(restored, commands, at(JUN_1));
      expect(restored.snapshot()).toEqual(engine.snapshot());
      expect(restored.drainNotifications()).toEqual(engine.drainNotifications());
    });

    it('marks all up to a number read and rejects unknown numbers and codes', () => {
      const engine = engineOf(indebted);
      engine.runUntil(at(APR_1, 6));
      expect(
        engine.applyCommand(command(engine, { type: 'markNotificationsRead', upTo: 3 }, 'a')),
      ).toEqual({ ok: false, error: 'unknown-notification' });
      expect(
        engine.applyCommand(
          command(
            engine,
            { type: 'setAutoPause', code: 'backup-reminder' as never, enabled: true },
            'b',
          ),
        ),
      ).toEqual({ ok: false, error: 'unknown-notification-code' });
      expect(
        engine.applyCommand(command(engine, { type: 'markNotificationsRead', upTo: 2 }, 'c')),
      ).toEqual({ ok: true });
      expect(engine.player.notifications).toMatchObject({ readUpTo: 2, readSeqs: [] });
    });

    // Commands the guards would refuse can still reach the engine from an older command log.
    it.each<[string, WithoutStamp<GameCommand>]>([
      [
        'auto-pause switched by a string',
        { type: 'setAutoPause', code: 'month-closed', enabled: 'yes' as never },
      ],
      ['a fractional mark', { type: 'markNotificationsRead', upTo: 1.5 }],
      ['a fractional number', { type: 'markNotificationsRead', upTo: 1, seqs: [1, 1.5] }],
      ['numbers that are not a list', { type: 'markNotificationsRead', seqs: 2 as never }],
    ])('rejects %s as invalid-command and changes nothing', (_label, body) => {
      const engine = engineOf(indebted);
      engine.runUntil(at(APR_1, 6));
      const before = engine.snapshot().player.notifications;
      expect(engine.applyCommand(command(engine, body))).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      expect(engine.player.notifications).toEqual(before);
    });
  });
});
