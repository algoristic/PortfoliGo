import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
  weekdayOfDay,
} from '@app/clock/domain/calendar-logic';
import { CalendarDate, SATURDAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { seriesCount } from '@app/market/domain/series';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { EngineEvent } from './models/engine-event.model';
import { GameSnapshot } from './models/game-state.model';
import { replayCommands } from './replay';
import { scheduleTask } from './scheduler';
import { MiniGame, miniGame } from './testing/mini-game';

// Engine behaviour against calendar literals (TS §3.1, §3.3, §3.8) on the mini world.

function at(date: CalendarDate, hour = 0, minute = 0): number {
  return dateTimeToTick({ ...date, hour, minute });
}

/** `HH:MM type exchange` of the session, month and year events. */
function describeEvent(event: EngineEvent): string {
  const minute = (event.tick - dayStartTick(dayIndex(event.tick))) / TICKS_PER_MINUTE;
  const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  switch (event.type) {
    case 'session-opened':
    case 'session-closed':
      return `${time} ${event.type} ${event.exchangeId}`;
    case 'month-ended':
      return `${time} ${event.type} ${event.year}-${event.month}`;
    case 'year-ended':
      return `${time} ${event.type} ${event.year}`;
    default:
      return `${time} ${event.type}`;
  }
}

const CALENDAR_TYPES = ['session-opened', 'session-closed', 'month-ended', 'year-ended'];

describe('GameEngine', () => {
  let mini: MiniGame;
  let engine: GameEngine;

  beforeAll(() => {
    mini = miniGame();
  });

  beforeEach(() => {
    engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
  });

  /** Engine on a freshly created game world, so that the world's sessions are built in the test. */
  function freshEngine(): GameEngine {
    const world = createGameWorld(mini.world.seedKey, mini.world.world);
    return GameEngine.restore(world, mini.start, { monthStarts: mini.monthStarts });
  }

  describe('start', () => {
    it('starts on Monday, 01.04.2030, 00:00 with the given conditions', () => {
      const started = GameEngine.restore(mini.world, mini.start, { monthStarts: [] });
      expect(started.tick).toBe(at({ year: 2030, month: 4, day: 1 }));
      expect(started.tick).toBe(GAME_START_TICK);
      expect(started.player.backgroundMode).toBe('realtime');
      expect(started.player.start).toEqual({
        startCapital: 1_000_000,
        netIncome: 280_000,
        livingCosts: 170_000,
      });
    });

    // TS §5.7: the first branch bank in world order becomes the home bank
    it('makes the first branch bank in world order the home bank', () => {
      const started = GameEngine.restore(mini.world, mini.start, { monthStarts: [] });
      const banks = mini.world.world.banks;
      const position = banks.findIndex((bank) => bank.id === started.player.homeBankId);
      expect(banks[position]?.type).toBe('branch');
      expect(banks.slice(0, position).map((bank) => bank.type)).not.toContain('branch');
    });

    it('rejects a world without a branch bank', () => {
      const banks = mini.world.world.banks.filter((bank) => bank.type !== 'branch');
      const world = { ...mini.world, world: { ...mini.world.world, banks } };
      expect(() => GameEngine.start(world, mini.start.player.start)).toThrow(/no branch bank/);
    });

    // TS §7.2: the start capital is booked against `external:opening-balance` on the current
    // account of the home bank; accounts are numbered from the counter (`acc-1`, `0000000001`)
    it('opens the salary account at the home bank with the start capital', () => {
      const start = at({ year: 2030, month: 4, day: 1 });
      const { player } = mini.start;
      expect(player.accounts).toEqual([
        {
          id: 'acc-1',
          kind: 'current',
          bankId: player.homeBankId,
          number: '0000000001',
          openedAt: start,
          closedAt: null,
        },
      ]);
      expect(player.depots).toEqual([]);
      expect(player.salaryAccountId).toBe('acc-1');
      expect(player.balances).toEqual(new Map([['acc-1', 1_000_000]]));
      expect(mini.journal).toEqual([
        {
          seq: 1,
          tick: start,
          type: 'opening-balance',
          postings: [
            { account: 'acc-1', amount: 1_000_000, balanceAfter: 1_000_000 },
            { account: 'external:opening-balance', amount: -1_000_000, balanceAfter: null },
          ],
        },
      ]);
      expect(player).toMatchObject({ accountSequence: 1, nextTransactionSeq: 2 });
    });

    it('books no opening balance for a start capital of 0', () => {
      const started = GameEngine.start(mini.world, {
        ...mini.start.player.start,
        startCapital: 0,
      });
      expect(started.drainTransactions()).toEqual([]);
      expect(started.player.balances).toEqual(new Map([['acc-1', 0]]));
      expect(started.player.nextTransactionSeq).toBe(1);
    });

    it('does not restore transactions that were not drained', () => {
      const restored = GameEngine.restore(mini.world, mini.start, {
        monthStarts: mini.monthStarts,
      });
      expect(restored.drainTransactions()).toEqual([]);
    });

    it('opens Asia-Pacific first, at 01:00 on the first game day', () => {
      engine.runUntil(at({ year: 2030, month: 4, day: 1 }, 1));
      const opened = engine.drainEvents().filter((event) => event.type === 'session-opened');
      expect(opened).toEqual([
        {
          type: 'session-opened',
          tick: at({ year: 2030, month: 4, day: 1 }, 1),
          exchangeId: 'exc-jp',
        },
        {
          type: 'session-opened',
          tick: at({ year: 2030, month: 4, day: 1 }, 1),
          exchangeId: 'exc-au',
        },
        {
          type: 'session-opened',
          tick: at({ year: 2030, month: 4, day: 1 }, 1),
          exchangeId: 'exc-hk',
        },
      ]);
    });
  });

  describe('runUntil', () => {
    // TS §3.3 trading hours, TS §3.8 order; Wednesday, 01.05.2030 is a month start.
    it('reports the sessions of a trading day in the order of the scheduler', () => {
      engine.runUntil(at({ year: 2030, month: 5, day: 2 }) - TICKS_PER_MINUTE);
      const day = dayIndex(at({ year: 2030, month: 5, day: 1 }));
      const events = engine
        .drainEvents()
        .filter((event) => dayIndex(event.tick) === day && CALENDAR_TYPES.includes(event.type))
        .map(describeEvent);
      expect(events).toEqual([
        '00:00 month-ended 2030-4',
        '01:00 session-opened exc-jp',
        '01:00 session-opened exc-au',
        '01:00 session-opened exc-hk',
        '04:45 session-opened exc-in',
        '07:00 session-closed exc-jp',
        '07:00 session-closed exc-au',
        '07:00 session-closed exc-hk',
        '09:00 session-opened exc-de',
        '09:00 session-opened exc-fr',
        '09:00 session-opened exc-gb',
        '09:00 session-opened exc-ch',
        '09:00 session-opened exc-nl',
        '11:00 session-closed exc-in',
        '14:00 session-opened exc-br',
        '15:30 session-opened exc-us',
        '15:30 session-opened exc-ca',
        '17:30 session-closed exc-de',
        '17:30 session-closed exc-fr',
        '17:30 session-closed exc-gb',
        '17:30 session-closed exc-ch',
        '17:30 session-closed exc-nl',
        '21:00 session-closed exc-br',
        '22:00 session-closed exc-us',
        '22:00 session-closed exc-ca',
      ]);
    });

    it('reports no sessions on the weekend 06./07.04.2030', () => {
      engine.runUntil(at({ year: 2030, month: 4, day: 6 }) - TICKS_PER_MINUTE);
      engine.drainEvents();
      engine.runUntil(at({ year: 2030, month: 4, day: 8 }) - TICKS_PER_MINUTE);
      expect(engine.drainEvents()).toEqual([]);
    });

    it('ends December before the year at 00:00 on 01.01.2031', () => {
      engine.runUntil(at({ year: 2031, month: 1, day: 1 }));
      const events = engine
        .drainEvents()
        .filter((event) => event.type === 'month-ended' || event.type === 'year-ended')
        .slice(-2);
      expect(events).toEqual([
        { type: 'month-ended', tick: at({ year: 2031, month: 1, day: 1 }), year: 2030, month: 12 },
        { type: 'year-ended', tick: at({ year: 2031, month: 1, day: 1 }), year: 2030 },
      ]);
    });

    it('reports the end of every year', () => {
      engine.runUntil(at({ year: 2032, month: 1, day: 1 }));
      const years = engine
        .drainEvents()
        .filter((event) => event.type === 'year-ended')
        .map((event) => [event.tick, event.type === 'year-ended' ? event.year : 0]);
      expect(years).toEqual([
        [at({ year: 2031, month: 1, day: 1 }), 2030],
        [at({ year: 2032, month: 1, day: 1 }), 2031],
      ]);
    });

    it('reports reaching the target even when the host yields at the target tick', () => {
      expect(engine.runUntil(at({ year: 2030, month: 4, day: 1 }, 1), () => true)).toBe(true);
      expect(engine.runUntil(engine.tick, () => true)).toBe(true);
      expect(engine.tick).toBe(at({ year: 2030, month: 4, day: 1 }, 1));
    });

    it('stops at the target tick and when the host yields', () => {
      const target = at({ year: 2030, month: 4, day: 3 }, 12, 34);
      let calls = 0;
      expect(engine.runUntil(target, () => ++calls === 2)).toBe(false);
      expect(engine.tick).toBe(at({ year: 2030, month: 4, day: 1 }, 4, 45));
      expect(engine.runUntil(target)).toBe(true);
      expect(engine.tick).toBe(target);
      engine.step();
      expect(engine.tick).toBe(target + TICKS_PER_MINUTE);
    });
  });

  describe('session-closed', () => {
    it('closes every series exactly once per trading day', () => {
      const engine = freshEngine();
      engine.runUntil(at({ year: 2030, month: 7, day: 1 }) - TICKS_PER_MINUTE);
      const closed = new Map<number, number[]>();
      for (const event of engine.drainEvents()) {
        if (event.type === 'session-closed') {
          expect(event.day).toBe(dayIndex(event.tick));
          closed.set(event.day, [...(closed.get(event.day) ?? []), ...event.series]);
        }
      }
      const all = Array.from({ length: seriesCount(mini.world.context) }, (_, s) => s);
      // April to June 2030 have 65 weekdays.
      expect(closed.size).toBe(65);
      for (const [day, series] of closed) {
        expect(weekdayOfDay(day)).toBeLessThan(SATURDAY);
        expect([...series].sort((a, b) => a - b)).toEqual(all);
      }
    });

    it('closes a share with its exchange and an index with its latest exchange', () => {
      const engine = freshEngine();
      engine.runUntil(at({ year: 2030, month: 4, day: 2 }) - TICKS_PER_MINUTE);
      const { world, context } = mini.world;
      const closes = engine.drainEvents().filter((event) => event.type === 'session-closed');
      const closingEvent = (series: number): (typeof closes)[number] | undefined =>
        closes.find((candidate) => candidate.series.includes(series));
      world.companies.forEach((company, i) => {
        expect(closingEvent(i)?.exchangeId).toBe(company.exchangeId);
      });
      const shares = context.layout.instrumentIds.length;
      world.indices.forEach((index, x) => {
        const latestClose = Math.max(
          ...index.constituents.map((id) => {
            const company = world.companies.find((candidate) => candidate.id === id);
            const exchange = world.exchanges.find(
              (candidate) => candidate.id === company?.exchangeId,
            );
            return exchange?.close ?? Number.NaN;
          }),
        );
        const expected = at({ year: 2030, month: 4, day: 1 }) + latestClose * TICKS_PER_MINUTE;
        expect(closingEvent(shares + x)?.tick).toBe(expected);
        expect(closingEvent(shares + world.indices.length + x)?.tick).toBe(expected);
      });
      for (const event of closes) {
        expect(event.series).toEqual([...event.series].sort((a, b) => a - b));
      }
    });
  });

  describe('dividends', () => {
    // The year runs inside each test, so that mutation tests see it (CLAUDE.md §10).
    function yearOfEvents(): EngineEvent[] {
      const yearEngine = freshEngine();
      yearEngine.runUntil(at({ year: 2031, month: 4, day: 1 }));
      return yearEngine.drainEvents();
    }

    it('reports ex-dates at the open of the exchange, as announced, paid two bank days later', () => {
      const events = yearOfEvents();
      const { world, context } = mini.world;
      const shares = context.layout.instrumentIds.length;
      const exDates = events.filter((event) => event.type === 'ex-dividend');
      const stockExDates = exDates.filter((event) => event.series < shares);
      expect(stockExDates.length).toBeGreaterThan(0);
      for (const event of exDates) {
        const exDay = dayIndex(event.tick);
        const opened = events.find(
          (candidate) => candidate.type === 'session-opened' && candidate.tick === event.tick,
        );
        expect(opened).toBeDefined();
        let bankDays = 0;
        for (let day = exDay + 1; day <= event.paymentDay; day++) {
          bankDays += weekdayOfDay(day) < SATURDAY ? 1 : 0;
        }
        expect(bankDays).toBe(2);
        expect(weekdayOfDay(event.paymentDay)).toBeLessThan(SATURDAY);
        expect(event.cents).toBeGreaterThan(0);
      }
      for (const event of events) {
        if (event.type === 'dividend-announced') {
          expect(event.cents).toBeGreaterThan(0);
          expect(event.exDay).toBeGreaterThan(dayIndex(event.tick));
        }
      }
      for (const event of stockExDates) {
        const exchange = world.exchanges.find(
          (candidate) => candidate.id === world.companies[event.series].exchangeId,
        );
        expect(event.tick).toBe(
          dayStartTick(dayIndex(event.tick)) + (exchange?.open ?? -1) * TICKS_PER_MINUTE,
        );
        const announced = events.find(
          (candidate) =>
            candidate.type === 'dividend-announced' &&
            candidate.series === event.series &&
            candidate.exDay === dayIndex(event.tick),
        );
        // Ex-dates in the first 20 market days were announced before the game start.
        if (dayIndex(event.tick) > dayIndex(at({ year: 2030, month: 5, day: 1 }))) {
          expect(announced).toMatchObject({ cents: event.cents });
        }
      }
    });

    it('reports distributions of distributing ETFs only', () => {
      const events = yearOfEvents();
      const { world, context } = mini.world;
      const firstEtf = seriesCount(context) - world.etfs.length;
      const distributing = new Set(
        events
          .filter((event) => event.type === 'ex-dividend' && event.series >= firstEtf)
          .map((event) => (event.type === 'ex-dividend' ? event.series - firstEtf : -1)),
      );
      const expected = world.etfs.flatMap((etf, e) =>
        etf.distribution.kind === 'distributing' ? [e] : [],
      );
      expect([...distributing].sort((a, b) => a - b)).toEqual(expected);
    });
  });

  describe('applyCommand', () => {
    it('sets the background mode after the current tick', () => {
      const tick = engine.tick;
      engine.drainEvents();
      expect(
        engine.applyCommand({ id: 'c1', type: 'setBackgroundMode', mode: 'pause', tick }),
      ).toEqual({
        ok: true,
      });
      expect(engine.player.backgroundMode).toBe('pause');
      expect(engine.drainEvents()).toEqual([
        { type: 'background-mode-changed', tick, mode: 'pause' },
      ]);
    });

    it('rejects a command stamped with another tick', () => {
      const command = { id: 'c1', type: 'setBackgroundMode', mode: 'pause' } as const;
      expect(engine.applyCommand({ ...command, tick: engine.tick + 1 })).toEqual({
        ok: false,
        error: 'tick-mismatch',
      });
      expect(engine.applyCommand({ ...command, tick: engine.tick - 1 })).toEqual({
        ok: false,
        error: 'tick-mismatch',
      });
      expect(engine.player.backgroundMode).toBe('realtime');
    });

    it('rejects an unknown mode or command', () => {
      const tick = engine.tick;
      const invalid = { id: 'c1', type: 'setBackgroundMode', mode: 'sleep', tick } as unknown;
      expect(engine.applyCommand(invalid as never)).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      const unknown = { id: 'c2', type: 'renamePlayer', tick } as unknown;
      expect(engine.applyCommand(unknown as never)).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      expect(engine.player.backgroundMode).toBe('realtime');
    });

    it('accepts a command ID again after the command failed', () => {
      const tick = engine.tick;
      const invalid = { id: 'c1', type: 'setBackgroundMode', mode: 'sleep', tick } as unknown;
      engine.applyCommand(invalid as never);
      expect(
        engine.applyCommand({ id: 'c1', type: 'setBackgroundMode', mode: 'pause', tick }),
      ).toEqual({
        ok: true,
      });
      expect(engine.player.backgroundMode).toBe('pause');
    });

    it('applies a repeated command ID only once per tick', () => {
      const tick = engine.tick;
      engine.drainEvents();
      engine.applyCommand({ id: 'c1', type: 'setBackgroundMode', mode: 'pause', tick });
      expect(
        engine.applyCommand({ id: 'c1', type: 'setBackgroundMode', mode: 'realtime', tick }),
      ).toEqual({
        ok: true,
      });
      expect(engine.player.backgroundMode).toBe('pause');
      expect(engine.drainEvents()).toHaveLength(1);
      const restored = GameEngine.restore(mini.world, engine.snapshot(), {
        monthStarts: mini.monthStarts,
      });
      restored.applyCommand({ id: 'c1', type: 'setBackgroundMode', mode: 'realtime', tick });
      expect(restored.player.backgroundMode).toBe('pause');
    });
  });

  describe('restore', () => {
    it('keeps the month starts and the snapshot independent of the running engine', () => {
      const monthStarts = mini.monthStarts.slice();
      const snapshot = engine.snapshot();
      const restored = GameEngine.restore(mini.world, snapshot, { monthStarts });
      restored.runUntil(at({ year: 2030, month: 6, day: 2 }));
      restored.applyCommand({
        id: 'c1',
        type: 'setBackgroundMode',
        mode: 'pause',
        tick: restored.tick,
      });
      expect(monthStarts).toHaveLength(mini.monthStarts.length);
      expect(snapshot).toEqual(mini.start);
      expect(
        restored.monthStartsAfter(dayIndex(at({ year: 2030, month: 4, day: 1 }))),
      ).toMatchObject([
        { day: dayIndex(at({ year: 2030, month: 5, day: 1 })) },
        { day: dayIndex(at({ year: 2030, month: 6, day: 1 })) },
      ]);
    });

    it('rebuilds month starts that do not match the snapshot', () => {
      const last = mini.monthStarts[mini.monthStarts.length - 1];
      const level = last.level.slice();
      level[0] += 0.01;
      const corrupted = [...mini.monthStarts.slice(0, -1), { ...last, level }];
      const restored = GameEngine.restore(mini.world, mini.start, { monthStarts: corrupted });
      expect(restored.monthStartsAfter(-1)).toEqual(mini.monthStarts);
    });

    it('rejects a snapshot whose market does not belong to the world', () => {
      const level = mini.start.market.level.slice();
      level[0] += 0.01;
      const foreign: GameSnapshot = { ...mini.start, market: { ...mini.start.market, level } };
      expect(() => GameEngine.restore(mini.world, foreign)).toThrow(/does not belong/);
    });

    it('never runs a reserved task silently', () => {
      const snapshot = engine.snapshot();
      scheduleTask(snapshot.scheduler, snapshot.tick + 1, { kind: 'order-expiry' });
      const restored = GameEngine.restore(mini.world, snapshot, { monthStarts: mini.monthStarts });
      expect(() => restored.step()).toThrow(/order-expiry/);
    });
  });

  describe('replayCommands', () => {
    it('applies the commands from the current tick on and runs to the target', () => {
      const start = engine.tick;
      const target = at({ year: 2030, month: 4, day: 2 });
      const results = replayCommands(
        engine,
        [
          { id: 'old', type: 'setBackgroundMode', mode: 'pause', tick: start - 1 },
          { id: 'c1', type: 'setBackgroundMode', mode: 'pause', tick: start + 5 },
          { id: 'c2', type: 'setBackgroundMode', mode: 'realtime', tick: start + 90 },
          { id: 'c3', type: 'setBackgroundMode', mode: 'pause', tick: start + 90 },
        ],
        target,
      );
      expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
      expect(engine.tick).toBe(target);
      expect(engine.player.backgroundMode).toBe('pause');
      const changes = engine
        .drainEvents()
        .filter((event) => event.type === 'background-mode-changed');
      expect(changes.map((event) => event.tick)).toEqual([start + 5, start + 90, start + 90]);
    });
  });
});
