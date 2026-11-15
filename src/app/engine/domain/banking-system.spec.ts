import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { CalendarDate, Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { normal } from '@app/simulation/util/distributions';
import { createStream } from '@app/simulation/util/random-stream';
import { openTaxYear } from '@app/taxes/domain/tax-logic';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { BankingSystem } from './banking-system';
import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { EngineEvent } from './models/engine-event.model';
import { GameSnapshot, StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { startBankingGame, TestBooks, withBooks, withTestBanks } from './testing/banking-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Banking system of the engine (TS §3.8, §7.4, §7.7) over several simulated months, with the test
// banks of `testing/banking-game.ts` (conditions of the examples in TS §7.3 and §7.4): home bank
// `b1` 12,00 € a month without waiver, `b2` 9,90 € unless 700 € came in, savings 2 % (`b1` monthly,
// `b2` quarterly), overdraft 11 % + 4 points beyond the limit, limit factor 2, clearing accounts at
// `b3` 1,5 % credit and 9 % debit. Expected amounts are computed in the tests from those rates.

function at(date: CalendarDate, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ ...date, hour, minute });
}

const APR_1 = { year: 2030, month: 4, day: 1 };
const APR_30 = { year: 2030, month: 4, day: 30 };
/** Wednesday; bank holidays only come with stage 2 (TS §3.1), so it is the first bank working day. */
const MAY_1 = { year: 2030, month: 5, day: 1 };
const MAY_31 = { year: 2030, month: 5, day: 31 };
/** Monday; 01./02.06.2030 are a weekend. */
const JUN_3 = { year: 2030, month: 6, day: 3 };
/** Friday; 29./30.06.2030 are a weekend. */
const JUN_28 = { year: 2030, month: 6, day: 28 };
const JUL_1 = { year: 2030, month: 7, day: 1 };

const NET_INCOME = 250_000;
const BASE_LIVING_COSTS = 180_000;
const FUNDED: StartConditions = {
  startCapital: 1_000_000,
  netIncome: NET_INCOME,
  livingCosts: BASE_LIVING_COSTS,
};

interface Started {
  start: GameSnapshot;
  monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
}

/** A transaction without its number and running balances. */
interface Entry {
  tick: Tick;
  type: string;
  postings: [string, Cents][];
  params?: Transaction['params'];
}

function entry({ tick, type, postings, params }: Transaction): Entry {
  const result: Entry = { tick, type, postings: postings.map((p) => [p.account, p.amount]) };
  return params === undefined ? result : { ...result, params };
}

/** `-x` rounded half away from zero, for debits. */
function roundedDebit(cents: number): Cents {
  return -Math.round(cents);
}

const WARNINGS: readonly string[] = ['account-uncovered', 'overdraft-limit-exceeded'];

function warnings(events: readonly EngineEvent[]): EngineEvent[] {
  return events.filter(({ type }) => WARNINGS.includes(type));
}

describe('BankingSystem', () => {
  let world: GameWorld;
  let funded: Started;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    world = createGameWorld(seedKey, mini);
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

  /** Runs to `tick` and returns what was booked on the way. */
  function bookedUntil(engine: GameEngine, tick: Tick): Entry[] {
    engine.runUntil(tick);
    return engine.drainTransactions().map(entry);
  }

  /** Living costs of a month from its stream (TS §4.2, §7.4): ε ~ N(0; 0.05) bounded to ±0.15. */
  function expectedLivingCosts(base: Cents, month: string): Cents {
    const epsilon = normal(createStream(world.seedKey, `life/living-costs/${month}`), 0, 0.05);
    return Math.round(base * (1 + Math.min(0.15, Math.max(-0.15, epsilon))));
  }

  describe('start', () => {
    // TS §7.4: the home bank starts as if it had received the net income in January to March
    it('starts the salary account with the full limit and empty household values', () => {
      const { player } = startBankingGame(world, FUNDED).snapshot();
      expect(player.overdraftLimits).toEqual([{ accountId: 'acc-1', limit: 500_000 }]);
      expect(player.inflows).toEqual([
        {
          accountId: 'acc-1',
          salaryWindow: [NET_INCOME, NET_INCOME, NET_INCOME],
          salaryThisMonth: 0,
          depositsLastMonth: 0,
          depositsThisMonth: 1_000_000,
        },
      ]);
      expect(player.interest).toEqual([
        { accountId: 'acc-1', credit: 0, debit: 0, pendingCredit: 0, pendingDebit: 0 },
      ]);
      expect(player.taxYear).toEqual(openTaxYear(2030));
      expect(player.closedTaxYears).toEqual([]);
      expect(player.monthlyValues).toEqual({
        income: 0,
        livingCosts: 0,
        fees: 0,
        creditInterest: 0,
        debitInterest: 0,
        taxes: 0,
        dividends: 0,
        orderFees: 0,
        savingsPlanFees: 0,
        accountFees: 0,
        custodyFees: 0,
        spreadCosts: 0,
        terCosts: 0,
      });
      expect(player.closedMonths).toEqual([]);
    });
  });

  describe('US-EK-01: bank run', () => {
    // TS §3.1, §7.4: the game starts on the first bank working day; March is not settled
    it('books the living costs of April at 06:00 on 01.04.2030 and no fee for March', () => {
      const engine = engineOf(funded);
      expect(bookedUntil(engine, at(APR_1, 5, 59))).toEqual([]);
      const living = expectedLivingCosts(BASE_LIVING_COSTS, '2030-04');
      expect(living).toBeGreaterThanOrEqual(153_000);
      expect(living).toBeLessThanOrEqual(207_000);
      expect(bookedUntil(engine, at(APR_1, 6))).toEqual([
        {
          tick: at(APR_1, 6),
          type: 'living-costs',
          postings: [
            ['acc-1', -living],
            ['external:living-costs', living],
          ],
          params: { month: '2030-04' },
        },
      ]);
    });

    // TS §7.4 table of the bank run days (E-19)
    it('books on the first and last bank working days of three months', () => {
      const engine = engineOf(funded);
      engine.runUntil(at(JUL_1, 23, 59));
      const journal = engine.drainTransactions();
      // Transaction 1 is the opening balance.
      expect(journal.map(({ seq }) => seq)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(engine.player.nextTransactionSeq).toBe(12);
      const booked = journal.map(({ tick, type }) => [tick, type]);
      expect(booked).toEqual([
        [at(APR_1, 6), 'living-costs'],
        [at(APR_30, 6), 'salary'],
        [at(MAY_1, 6), 'living-costs'],
        [at(MAY_1, 6), 'account-fee'],
        [at(MAY_31, 6), 'salary'],
        [at(JUN_3, 6), 'living-costs'],
        [at(JUN_3, 6), 'account-fee'],
        [at(JUN_28, 6), 'salary'],
        [at(JUL_1, 6), 'living-costs'],
        [at(JUL_1, 6), 'account-fee'],
      ]);
    });

    it('pays the net income against the employer and charges the month fee of the home bank', () => {
      const engine = engineOf(funded);
      engine.runUntil(at(APR_30, 5, 59));
      engine.drainTransactions();
      expect(bookedUntil(engine, at(APR_30, 6))).toEqual([
        {
          tick: at(APR_30, 6),
          type: 'salary',
          postings: [
            ['acc-1', NET_INCOME],
            ['external:employer', -NET_INCOME],
          ],
          params: { month: '2030-04' },
        },
      ]);
      // 12,00 € without waiver for the 30 days of April, although 12.500 € came in
      expect(bookedUntil(engine, at(MAY_1, 6))[1]).toEqual({
        tick: at(MAY_1, 6),
        type: 'account-fee',
        postings: [
          ['acc-1', -1_200],
          ['external:bank:b1:fees', 1_200],
        ],
        params: { month: '2030-04' },
      });
    });

    // TS §3.8, §7.4: limits, credit interest with its tax, living costs, fees, overdraft and debit
    // interest; within a step in account order
    it('books the credits before the debits in one bank run', () => {
      const broke = started({ ...FUNDED, startCapital: 0 });
      const engine = engineOf(broke, {
        accounts: [
          { kind: 'savings', bankId: 'b1', balance: 1_000_000 },
          { kind: 'clearing', bankId: 'b3', balance: -200_000 },
        ],
      });
      const april = expectedLivingCosts(BASE_LIVING_COSTS, '2030-04');
      const may = expectedLivingCosts(BASE_LIVING_COSTS, '2030-05');
      engine.runUntil(at(MAY_1, 5, 59));
      engine.drainTransactions();
      engine.drainEvents();
      // `acc-1` is −April's living costs from 01.04. to 29.04., positive after the salary on 30.04.
      const overdraft = roundedDebit((april * 0.11 * 29) / 365);
      expect(bookedUntil(engine, at(MAY_1, 6))).toEqual([
        {
          tick: at(MAY_1, 6),
          type: 'credit-interest',
          // 10.000 € at 2 % for 30 days: 16,4383… €
          postings: [
            ['acc-2', 1_644],
            ['external:bank:b1:interest', -1_644],
          ],
          params: { from: '2030-04', to: '2030-04' },
        },
        {
          tick: at(MAY_1, 6),
          type: 'living-costs',
          postings: [
            ['acc-1', -may],
            ['external:living-costs', may],
          ],
          params: { month: '2030-05' },
        },
        {
          tick: at(MAY_1, 6),
          type: 'account-fee',
          postings: [
            ['acc-1', -1_200],
            ['external:bank:b1:fees', 1_200],
          ],
          params: { month: '2030-04' },
        },
        {
          tick: at(MAY_1, 6),
          type: 'overdraft-interest',
          postings: [
            ['acc-1', overdraft],
            ['external:bank:b1:interest', -overdraft],
          ],
          params: { from: '2030-04', to: '2030-04' },
        },
        {
          tick: at(MAY_1, 6),
          type: 'debit-interest',
          // TS §7.3: −2.000 € at 9 % for 30 days, −14,79 €
          postings: [
            ['acc-3', -1_479],
            ['external:bank:b3:interest', 1_479],
          ],
          params: { from: '2030-04', to: '2030-04' },
        },
      ]);
      // May's living costs uncover `acc-1` again after the salary; the debits after them don't.
      expect(engine.drainEvents()).toEqual([
        {
          type: 'interest-credited',
          tick: at(MAY_1, 6),
          accountId: 'acc-2',
          amount: 1_644,
          tax: 0,
        },
        {
          type: 'account-uncovered',
          tick: at(MAY_1, 6),
          accountId: 'acc-1',
          balance: -april + NET_INCOME - may,
          limit: 500_000,
        },
      ]);
      expect(engine.player.monthlyValues).toEqual({
        income: 0,
        livingCosts: may,
        fees: 1_200,
        creditInterest: 1_644,
        debitInterest: -overdraft + 1_479,
        taxes: 0,
        dividends: 0,
        orderFees: 0,
        savingsPlanFees: 0,
        accountFees: 1_200,
        custodyFees: 0,
        spreadCosts: 0,
        terCosts: 0,
      });
    });

    it('books no salary and no living costs of 0', () => {
      const idle = started({ startCapital: 1_000_000, netIncome: 0, livingCosts: 0 });
      const booked = bookedUntil(engineOf(idle), at(JUL_1, 6)).map(({ type }) => type);
      expect(booked).toEqual(['account-fee', 'account-fee', 'account-fee']);
    });

    it('keeps the order of the steps over the order of the accounts', () => {
      const engine = engineOf(funded, {
        accounts: [
          { kind: 'clearing', bankId: 'b3', balance: -200_000 },
          { kind: 'current', bankId: 'b2', balance: -100_000 },
        ],
      });
      engine.runUntil(at(MAY_1, 5, 59));
      engine.drainTransactions();
      const booked = bookedUntil(engine, at(MAY_1, 6)).map(({ type, postings }) => [
        type,
        postings[0][0],
      ]);
      expect(booked).toEqual([
        ['living-costs', 'acc-1'],
        ['account-fee', 'acc-1'],
        ['account-fee', 'acc-4'],
        ['overdraft-interest', 'acc-4'],
        ['debit-interest', 'acc-2'],
      ]);
    });

    it('pays quarterly savings interest for the whole quarter on the first bank working day of July', () => {
      const engine = engineOf(funded, {
        accounts: [
          { kind: 'savings', bankId: 'b2', balance: 1_000_000 },
          { kind: 'clearing', bankId: 'b3', balance: 500_000 },
        ],
      });
      const credits = bookedUntil(engine, at(JUL_1, 6)).filter(
        ({ type }) => type === 'credit-interest',
      );
      // Clearing accounts are credited monthly at every bank (TS §7.4); TS §7.3: 5.000 € at 1,5 %
      // for 30 days, 6,16 €
      const clearing = credits.filter(({ postings }) => postings[0][0] === 'acc-3');
      expect(clearing.map(({ tick }) => tick)).toEqual([at(MAY_1, 6), at(JUN_3, 6), at(JUL_1, 6)]);
      expect(clearing[0].postings).toEqual([
        ['acc-3', 616],
        ['external:bank:b3:interest', -616],
      ]);
      // 10.000 € at 2 % for the 91 days of April to June: 49,8630… €
      expect(credits.filter(({ postings }) => postings[0][0] === 'acc-2')).toEqual([
        {
          tick: at(JUL_1, 6),
          type: 'credit-interest',
          postings: [
            ['acc-2', 4_986],
            ['external:bank:b2:interest', -4_986],
          ],
          params: { from: '2030-04', to: '2030-06' },
        },
      ]);
    });

    // TS §7.7: the saver's allowance of 1.000 € per year, 25 % above it; interest of December counts
    // in the year it is booked
    it('withholds tax only once the credit interest of the year exceeds 1.000 €', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'savings', bankId: 'b1', balance: 30_000_000 }],
      });
      const onAcc2 = (booked: Entry[]): Entry[] =>
        booked.filter(({ postings }) => postings[0][0] === 'acc-2');
      // April: 300.000 € × 2 % × 30/365 = 493,1506… €
      expect(onAcc2(bookedUntil(engine, at(MAY_1, 6)))).toEqual([
        {
          tick: at(MAY_1, 6),
          type: 'credit-interest',
          postings: [
            ['acc-2', 49_315],
            ['external:bank:b1:interest', -49_315],
          ],
          params: { from: '2030-04', to: '2030-04' },
        },
      ]);
      // May on 300.493,15 € for 31 days: 510,4267… €; 1.003,58 € in the year, tax 25 % × 3,58 €
      // = 0,895 €, rounded half away from zero. The two days of June before the run wait.
      expect(onAcc2(bookedUntil(engine, at(JUN_3, 6)))).toEqual([
        {
          tick: at(JUN_3, 6),
          type: 'credit-interest',
          postings: [
            ['acc-2', 51_043],
            ['external:bank:b1:interest', -51_043],
          ],
          params: { from: '2030-05', to: '2030-05' },
        },
        {
          tick: at(JUN_3, 6),
          type: 'tax',
          postings: [
            ['acc-2', -90],
            ['external:tax-office', 90],
          ],
        },
      ]);
      // June: 2 days on 300.493,15 €, 28 days on 301.002,68 €: 494,7424… €; tax 25 % × 498,32 €
      // = 124,58 € on the year's 1.498,32 €, 0,90 € of it withheld already
      expect(onAcc2(bookedUntil(engine, at(JUL_1, 6)))).toEqual([
        expect.objectContaining({
          type: 'credit-interest',
          postings: [
            ['acc-2', 49_474],
            ['external:bank:b1:interest', -49_474],
          ],
        }),
        {
          tick: at(JUL_1, 6),
          type: 'tax',
          postings: [
            ['acc-2', -12_368],
            ['external:tax-office', 12_368],
          ],
        },
      ]);
      expect(engine.player.taxYear).toEqual({
        ...openTaxYear(2030),
        income: 49_315 + 51_043 + 49_474,
        withheld: 90 + 12_368,
        interest: 49_315 + 51_043 + 49_474,
        paid: 90 + 12_368,
      });
      expect(engine.drainEvents().filter(({ type }) => type === 'interest-credited')).toEqual([
        {
          type: 'interest-credited',
          tick: at(MAY_1, 6),
          accountId: 'acc-2',
          amount: 49_315,
          tax: 0,
        },
        {
          type: 'interest-credited',
          tick: at(JUN_3, 6),
          accountId: 'acc-2',
          amount: 51_043,
          tax: 90,
        },
        {
          type: 'interest-credited',
          tick: at(JUL_1, 6),
          accountId: 'acc-2',
          amount: 49_474,
          tax: 12_368,
        },
      ]);

      // Wednesday, 01.01.2031: the interest of December opens the tax year 2031.
      const newYear = { year: 2031, month: 1, day: 1 };
      const december = onAcc2(bookedUntil(engine, at(newYear, 6)))
        .filter(({ tick }) => tick === at(newYear, 6))
        .map(({ type, postings }) => [type, postings[0][1]]);
      expect(december).toEqual([['credit-interest', expect.any(Number)]]);
      expect(engine.player.taxYear).toEqual({
        ...openTaxYear(2031),
        income: december[0][1],
        interest: december[0][1],
      });
      // The closed year 2030 stays as it ended for the tax overview (US-ST-04).
      expect(engine.player.closedTaxYears).toEqual([
        expect.objectContaining({ year: 2030, withheld: expect.any(Number) }),
      ]);
      expect(engine.player.closedTaxYears[0].interest).toBe(engine.player.closedTaxYears[0].income);
    });
  });

  describe('US-BK-07: overdraft', () => {
    // TS §7.3, §7.4: limit 2 × 2.500 €; living costs of about 6.000 € exceed it right away
    it('reports the uncovered account, charges the surcharge beyond the limit and warns again', () => {
      const indebted = started({ ...FUNDED, startCapital: 0, livingCosts: 600_000 });
      const engine = engineOf(indebted);
      const april = expectedLivingCosts(600_000, '2030-04');
      const may = expectedLivingCosts(600_000, '2030-05');
      expect(april).toBeGreaterThan(500_000);
      engine.runUntil(at(APR_1, 6));
      expect(warnings(engine.drainEvents())).toEqual([
        {
          type: 'account-uncovered',
          tick: at(APR_1, 6),
          accountId: 'acc-1',
          balance: -april,
          limit: 500_000,
        },
        {
          type: 'overdraft-limit-exceeded',
          tick: at(APR_1, 6),
          accountId: 'acc-1',
          balance: -april,
          limit: 500_000,
        },
      ]);
      // The salary brings the account back within the limit on 30.04.; no event for that.
      engine.runUntil(at(MAY_1, 5, 59));
      expect(warnings(engine.drainEvents())).toEqual([]);
      engine.drainTransactions();

      // 29 days: 5.000 € at 11 %, the rest at 15 %; 30.04.: −(April − 2.500 €) at 11 %
      const interest = roundedDebit(
        (29 * (500_000 * 0.11 + (april - 500_000) * 0.15) + (april - NET_INCOME) * 0.11) / 365,
      );
      const booked = bookedUntil(engine, at(MAY_1, 6));
      expect(booked.find(({ type }) => type === 'overdraft-interest')?.postings).toEqual([
        ['acc-1', interest],
        ['external:bank:b1:interest', -interest],
      ]);
      // May's living costs take the account beyond the limit again.
      expect(warnings(engine.drainEvents())).toEqual([
        {
          type: 'overdraft-limit-exceeded',
          tick: at(MAY_1, 6),
          accountId: 'acc-1',
          balance: -april + NET_INCOME - may,
          limit: 500_000,
        },
      ]);
    });

    // TS §7.4 limit table: salary account `acc-2` at `b2` from April on
    it('moves the limit to the new salary bank over three months and warns about the cut limit', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'current', bankId: 'b2', balance: 1_000_000 }],
        balances: { 'acc-1': -300_000 },
        salaryAccountId: 'acc-2',
      });
      const limitsAt = (date: CalendarDate): [AccountId, Cents][] => {
        engine.runUntil(at(date, 6));
        return engine.player.overdraftLimits.map(({ accountId, limit }) => [accountId, limit]);
      };
      expect(limitsAt(APR_1)).toEqual([
        ['acc-1', 500_000],
        ['acc-2', 0],
      ]);
      expect(limitsAt(MAY_1)).toEqual([
        ['acc-1', 333_300],
        ['acc-2', 166_600],
      ]);
      expect(limitsAt(JUN_3)).toEqual([
        ['acc-1', 166_600],
        ['acc-2', 333_300],
      ]);
      expect(limitsAt(JUL_1)).toEqual([
        ['acc-1', 0],
        ['acc-2', 500_000],
      ]);
      // −3.000 € at 11 % within the limit for the 30 days of April, booked on 01.05. with the fee
      const april = roundedDebit((300_000 * 0.11 * 30) / 365);
      expect(warnings(engine.drainEvents())).toEqual([
        {
          type: 'overdraft-limit-exceeded',
          tick: at(JUN_3, 6),
          accountId: 'acc-1',
          balance: -300_000 - 1_200 + april,
          limit: 166_600,
        },
      ]);
      // The salary went to `acc-2` and its fee was waived: 2.500 € came in each month.
      const fees = engine
        .drainTransactions()
        .filter(({ type }) => type === 'account-fee')
        .map(({ postings }) => postings[0].account);
      expect(fees).toEqual(['acc-1', 'acc-1', 'acc-1']);
    });
  });

  describe('accounts', () => {
    // TS §7.3: without a limit the surcharge applies to the whole negative balance
    it('charges each current account by its own limit', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'current', bankId: 'b2', balance: -100_000 }],
      });
      engine.runUntil(at(APR_1, 6));
      expect(engine.player.overdraftLimits).toEqual([
        { accountId: 'acc-1', limit: 500_000 },
        { accountId: 'acc-2', limit: 0 },
      ]);
      // `acc-2` was beyond its limit of 0 before the bank run set it.
      expect(warnings(engine.drainEvents())).toEqual([]);
      // −1.000 € at 15 % for the 30 days of April: −12,3287… €
      const overdraft = bookedUntil(engine, at(MAY_1, 6)).filter(
        ({ type }) => type === 'overdraft-interest',
      );
      expect(overdraft.map(({ postings }) => postings[0])).toEqual([['acc-2', -1_233]]);
    });

    it('accrues and books nothing for closed accounts', () => {
      const snapshot = withBooks(funded.start, {
        accounts: [
          { kind: 'savings', bankId: 'b1', balance: 1_000_000 },
          { kind: 'current', bankId: 'b2', balance: -100_000 },
          { kind: 'clearing', bankId: 'b3', balance: -100_000 },
        ],
      });
      for (const account of snapshot.player.accounts.slice(1)) {
        account.closedAt = snapshot.tick;
      }
      const engine = GameEngine.restore(withTestBanks(world), snapshot, {
        monthStarts: funded.monthStarts,
      });
      const booked = bookedUntil(engine, at(MAY_1, 6));
      const accounts = new Set(booked.flatMap(({ postings }) => postings.map(([id]) => id)));
      expect([...accounts].filter((id) => id.startsWith('acc-'))).toEqual(['acc-1']);
      expect(
        engine.player.interest
          .slice(1)
          .map(({ pendingCredit, pendingDebit, credit, debit }) => [
            pendingCredit,
            pendingDebit,
            credit,
            debit,
          ]),
      ).toEqual([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      expect(engine.player.overdraftLimits.map(({ accountId }) => accountId)).toEqual(['acc-1']);
      // Inflows are kept for current accounts only, closed ones included.
      expect(engine.player.inflows.map(({ accountId }) => accountId)).toEqual(['acc-1', 'acc-3']);
    });

    // TS §7.4 event table: only current accounts have a limit
    it('reports uncovered accounts with their limit after each posting', () => {
      const snapshot = withBooks(funded.start, {
        accounts: [{ kind: 'clearing', bankId: 'b3', balance: 500 }],
        balances: { 'acc-1': 10_000 },
      });
      const events: EngineEvent[] = [];
      const banking = new BankingSystem(withTestBanks(world), snapshot.player, {
        journal: () => undefined,
        emit: (event) => events.push(event),
      });
      const tick = snapshot.tick;
      banking.book({
        tick,
        type: 'transfer',
        postings: [
          { account: 'acc-2', amount: -800 },
          { account: 'acc-1', amount: -610_000 },
          { account: 'external:market', amount: 610_800 },
        ],
      });
      expect(events).toEqual([
        { type: 'account-uncovered', tick, accountId: 'acc-2', balance: -300, limit: null },
        { type: 'account-uncovered', tick, accountId: 'acc-1', balance: -600_000, limit: 500_000 },
        {
          type: 'overdraft-limit-exceeded',
          tick,
          accountId: 'acc-1',
          balance: -600_000,
          limit: 500_000,
        },
      ]);
    });

    it('rejects accounts at banks that do not offer them', () => {
      const runWith = (books: TestBooks) => () =>
        engineOf(funded, books).runUntil(at({ year: 2030, month: 4, day: 2 }));
      expect(runWith({ accounts: [{ kind: 'current', bankId: 'b3' }] })).toThrow(
        'BankingSystem: bank b3 has no current accounts',
      );
      expect(runWith({ accounts: [{ kind: 'savings', bankId: 'b3' }] })).toThrow(
        'BankingSystem: bank b3 has no savings accounts',
      );
      expect(runWith({ accounts: [{ kind: 'clearing', bankId: 'b9' }] })).toThrow(
        'BankingSystem: unknown bank b9',
      );
    });
  });

  describe('month end', () => {
    it('closes the monthly values of each month and starts the next one empty', () => {
      const engine = engineOf(funded);
      engine.runUntil(at(JUL_1));
      const living = (month: string): Cents => expectedLivingCosts(BASE_LIVING_COSTS, month);
      const values = (livingCosts: Cents, fees: Cents) => ({
        income: NET_INCOME,
        livingCosts,
        fees,
        creditInterest: 0,
        debitInterest: 0,
        taxes: 0,
        dividends: 0,
        orderFees: 0,
        savingsPlanFees: 0,
        accountFees: fees,
        custodyFees: 0,
        spreadCosts: 0,
        terCosts: 0,
      });
      // The opening balance counts for nothing; each month pays the fee of the one before.
      expect(engine.player.closedMonths).toEqual([
        { month: { year: 2030, month: 4 }, values: values(living('2030-04'), 0) },
        { month: { year: 2030, month: 5 }, values: values(living('2030-05'), 1_200) },
        { month: { year: 2030, month: 6 }, values: values(living('2030-06'), 1_200) },
      ]);
      expect(engine.player.monthlyValues).toEqual({ ...values(0, 0), income: 0 });
    });

    it('copies the household state into snapshots that share nothing with the engine', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'clearing', bankId: 'b3', balance: -200_000 }],
      });
      engine.runUntil(at(JUL_1, 12));
      const snapshot = engine.snapshot();
      expect(snapshot.player).toEqual(engine.player);
      snapshot.player.closedMonths[0].values.income = 0;
      snapshot.player.closedMonths[0].month.year = 0;
      snapshot.player.interest[1].credit = 1;
      snapshot.player.depots[0].closedAt = 0;
      snapshot.player.monthlyValues.fees = 0;
      expect(engine.player.closedMonths[0]).toMatchObject({
        month: { year: 2030 },
        values: { income: NET_INCOME },
      });
      expect(engine.player.interest[1].credit).not.toBe(1);
      expect(engine.player.depots[0].closedAt).toBeNull();
      expect(engine.player.monthlyValues.fees).toBe(1_200);
    });

    // TS §3.8: the day change at 00:00 accrues the month's last day before the month end
    it('settles the last day of a month with that month', () => {
      const engine = engineOf(funded, {
        accounts: [{ kind: 'savings', bankId: 'b1', balance: 1_000_000 }],
      });
      engine.runUntil(at(MAY_1) - TICKS_PER_MINUTE);
      const [accrual] = engine.player.interest.filter(({ accountId }) => accountId === 'acc-2');
      // 29 days of April are running, the 30th follows at 00:00.
      expect(accrual.credit).toBeCloseTo((1_000_000 * 0.02 * 29) / 365, 6);
      engine.runUntil(at(MAY_1));
      const [closed] = engine.player.interest.filter(({ accountId }) => accountId === 'acc-2');
      expect(closed).toMatchObject({ credit: 0, debit: 0, pendingDebit: 0 });
      expect(closed.pendingCredit).toBeCloseTo((1_000_000 * 0.02 * 30) / 365, 6);
    });
  });

  describe('settleAccount', () => {
    // TS §7.4 account closing: interest up to the day before, fees pro rata up to the closing day
    it('books the interest and fees of a closing account up to the closing day', () => {
      const engine = engineOf(funded, {
        accounts: [
          { kind: 'savings', bankId: 'b1', balance: 1_000_000 },
          { kind: 'current', bankId: 'b2', balance: 100_000 },
        ],
      });
      const closing = at({ year: 2030, month: 5, day: 10 }, 12);
      engine.runUntil(closing);
      engine.drainTransactions();
      const snapshot = engine.snapshot();
      const journal: Transaction[] = [];
      const events: EngineEvent[] = [];
      const banking = new BankingSystem(withTestBanks(world), snapshot.player, {
        journal: (transaction) => journal.push(transaction),
        emit: (event) => events.push(event),
      });
      banking.settleAccount('acc-2', closing);
      banking.settleAccount('acc-3', closing);
      // 10.016,44 € at 2 % for 01.05. to 09.05.: 4,9396… €
      // TS §7.4: 9,90 € × 10/31 = 3,1935… € for May; April was settled on 01.05.
      expect(journal.map(entry)).toEqual([
        {
          tick: closing,
          type: 'credit-interest',
          postings: [
            ['acc-2', 494],
            ['external:bank:b1:interest', -494],
          ],
          params: { from: '2030-05', to: '2030-05' },
        },
        {
          tick: closing,
          type: 'account-fee',
          postings: [
            ['acc-3', -319],
            ['external:bank:b2:fees', 319],
          ],
          params: { month: '2030-05' },
        },
      ]);
      expect(snapshot.player.interest.find(({ accountId }) => accountId === 'acc-2')).toEqual({
        accountId: 'acc-2',
        credit: 0,
        debit: 0,
        pendingCredit: 0,
        pendingDebit: 0,
      });
      expect(events).toEqual([
        { type: 'interest-credited', tick: closing, accountId: 'acc-2', amount: 494, tax: 0 },
      ]);
    });

    // TS §7.4 closing table: before the bank run of the closing month the previous month is open
    it('includes the previous month when the account closes before the bank run', () => {
      const engine = engineOf(funded, {
        accounts: [
          { kind: 'savings', bankId: 'b1', balance: 1_000_000 },
          { kind: 'current', bankId: 'b2', balance: 1_000_000 },
          { kind: 'clearing', bankId: 'b3', balance: -200_000 },
        ],
        salaryAccountId: 'acc-3',
      });
      // Sunday, 02.06.2030; the bank run of June follows on Monday, 03.06.
      const closing = at({ year: 2030, month: 6, day: 2 }, 12);
      engine.runUntil(closing);
      engine.drainTransactions();
      const snapshot = engine.snapshot();
      const journal: Transaction[] = [];
      const banking = new BankingSystem(withTestBanks(world), snapshot.player, {
        journal: (transaction) => journal.push(transaction),
        emit: () => undefined,
      });
      banking.settleAccount('acc-2', closing);
      banking.settleAccount('acc-3', closing);
      banking.settleAccount('acc-4', closing);
      expect(
        journal.map(({ type, postings }) => [type, postings[0].account, postings[0].amount]),
      ).toEqual([
        // 10.016,44 € at 2 % for May and 01.06.: 32 days, 17,5630… €
        ['credit-interest', 'acc-2', 1_756],
        // May is waived by its salary of 2.500 €; June: 9,90 € × 2/30
        ['account-fee', 'acc-3', -66],
        // −2.014,79 € at 9 % for 32 days: −15,8975… €
        ['debit-interest', 'acc-4', -1_590],
      ]);
    });
  });
});
