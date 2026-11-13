import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { CalendarDate, Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { accountViews, netWorth } from './account-projection';
import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { GameSnapshot, StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { startBankingGame, withTestBanks } from './testing/banking-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Bank commands of the engine (TS §7.4, §8.2; US-BK-02 to US-BK-05) with the test banks of
// `testing/banking-game.ts`: home bank `b1` (branch, 12,00 € a month, savings 2 % monthly), `b2`
// (direct, 9,90 € unless 700 € came in from outside, savings 2 % quarterly), broker `b3` (depots
// only; clearing accounts 1,5 % credit, 9 % debit); overdraft 11 % plus 4 points beyond the limit,
// limit factor 2. Accounts and balances come from commands, so the journal sums to the balances.
// Expected amounts are computed in the tests from those rates and calendar days.

function at(date: CalendarDate, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ ...date, hour, minute });
}

/** Tuesday; the account opens in the morning, its first day accrues at the end of the day. */
const APR_2 = { year: 2030, month: 4, day: 2 };
/** Wednesday; bank holidays only come with stage 2 (TS §3.1), so it is the first bank working day. */
const MAY_1 = { year: 2030, month: 5, day: 1 };
const MAY_10 = { year: 2030, month: 5, day: 10 };
/** Saturday; the bank run of June follows on Monday, 03.06. */
const JUN_1 = { year: 2030, month: 6, day: 1 };
const JUN_3 = { year: 2030, month: 6, day: 3 };

const NET_INCOME = 250_000;
const FUNDED: StartConditions = {
  startCapital: 1_000_000,
  netIncome: NET_INCOME,
  livingCosts: 180_000,
};

/** A transaction without its number and running balances. */
function entry({ type, postings, params, refs }: Transaction): unknown {
  return {
    type,
    postings: postings.map((p) => [p.account, p.amount]),
    ...(params === undefined ? {} : { params }),
    ...(refs === undefined ? {} : { refs }),
  };
}

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;
/** A command without the ID and the tick the host stamps on it. */
type Body = WithoutStamp<GameCommand>;

function touches(transactions: readonly Transaction[], id: AccountId): boolean {
  return transactions.some(({ postings }) => postings.some(({ account }) => account === id));
}

describe('BankCommands', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  let nextId: number;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), FUNDED);
    world = withTestBanks(engine.world);
    start = engine.snapshot();
    monthStarts = engine.monthStartsAfter(-1);
  });

  beforeEach(() => {
    nextId = 1;
  });

  /** The funded game at 01.04.2030 00:00, with empty buffers. */
  function newEngine(): GameEngine {
    const engine = GameEngine.restore(world, start, { monthStarts });
    engine.drainChangedAccounts();
    return engine;
  }

  function apply(engine: GameEngine, body: Body): CommandResult {
    return engine.applyCommand({ ...body, id: `c${nextId++}`, tick: engine.tick } as GameCommand);
  }

  /** Applies a command that must succeed. */
  function ok(engine: GameEngine, body: Body): CommandResult {
    const result = apply(engine, body);
    expect(result).toMatchObject({ ok: true });
    return result;
  }

  function balance(engine: GameEngine, id: AccountId): Cents {
    return engine.player.balances.get(id) as Cents;
  }

  /** `acc-2` savings at `b1` with 5.000 € and `acc-3` current at `b2` with 1.000 €, on 02.04.2030. */
  function withSavingsAndCurrent(): GameEngine {
    const engine = newEngine();
    engine.runUntil(at(APR_2, 10));
    ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
    ok(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' });
    ok(engine, transfer('acc-1', 'acc-2', 500_000));
    ok(engine, transfer('acc-1', 'acc-3', 100_000));
    return engine;
  }

  function transfer(from: AccountId, to: AccountId, amount: Cents, purpose = ''): Body {
    return { type: 'transfer', fromAccountId: from, toAccountId: to, amount, purpose };
  }

  describe('openAccount', () => {
    // US-BK-02: account kinds as the bank offers them, any number per bank and kind
    it('opens current and savings accounts and depots with numbers from the shared counter', () => {
      const engine = newEngine();
      const tick = engine.tick;
      expect(apply(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' })).toEqual({
        ok: true,
        opened: { accountId: 'acc-2', depotId: null },
      });
      expect(apply(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' })).toEqual({
        ok: true,
        opened: { accountId: 'acc-3', depotId: null },
      });
      expect(apply(engine, { type: 'openAccount', bankId: 'b3', kind: 'depot' })).toEqual({
        ok: true,
        opened: { accountId: 'acc-4', depotId: 'dep-5' },
      });
      expect(apply(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' })).toEqual({
        ok: true,
        opened: { accountId: 'acc-6', depotId: null },
      });
      expect(engine.player.accounts.slice(1)).toEqual([
        {
          id: 'acc-2',
          kind: 'current',
          bankId: 'b2',
          number: '0000000002',
          openedAt: tick,
          closedAt: null,
        },
        {
          id: 'acc-3',
          kind: 'savings',
          bankId: 'b1',
          number: '0000000003',
          openedAt: tick,
          closedAt: null,
        },
        {
          id: 'acc-4',
          kind: 'clearing',
          bankId: 'b3',
          number: '0000000004',
          openedAt: tick,
          closedAt: null,
          depotId: 'dep-5',
        },
        {
          id: 'acc-6',
          kind: 'current',
          bankId: 'b2',
          number: '0000000006',
          openedAt: tick,
          closedAt: null,
        },
      ]);
      expect(engine.player.depots).toEqual([
        {
          id: 'dep-5',
          bankId: 'b3',
          clearingAccountId: 'acc-4',
          number: '0000000005',
          openedAt: tick,
          closedAt: null,
        },
      ]);
      // New accounts are empty and get a limit only in the next bank run (TS §7.4).
      expect([...engine.player.balances.values()].slice(1)).toEqual([0, 0, 0, 0]);
      expect(engine.player.overdraftLimits.map(({ accountId }) => accountId)).toEqual(['acc-1']);
      expect(engine.player.inflows.map(({ accountId }) => accountId)).toEqual([
        'acc-1',
        'acc-2',
        'acc-6',
      ]);
      expect(engine.drainTransactions()).toEqual([]);
      expect(engine.drainChangedAccounts()).toEqual(['acc-2', 'acc-3', 'acc-4', 'acc-6']);
    });

    it('rejects kinds the bank does not offer and unknown banks without changing anything', () => {
      const engine = newEngine();
      const before = engine.snapshot();
      expect(apply(engine, { type: 'openAccount', bankId: 'b3', kind: 'current' })).toEqual({
        ok: false,
        error: 'account-kind-not-offered',
      });
      expect(apply(engine, { type: 'openAccount', bankId: 'b3', kind: 'savings' })).toEqual({
        ok: false,
        error: 'account-kind-not-offered',
      });
      expect(apply(engine, { type: 'openAccount', bankId: 'b9', kind: 'depot' })).toEqual({
        ok: false,
        error: 'unknown-bank',
      });
      expect(
        apply(engine, { type: 'openAccount', bankId: 'b1', kind: 'clearing' } as unknown as Body),
      ).toEqual({ ok: false, error: 'invalid-command' });
      expect(engine.snapshot().player).toEqual(before.player);
      expect(engine.drainChangedAccounts()).toEqual([]);
    });
  });

  describe('transfer', () => {
    // TS §7.4, US-BK-04: 10.000 € plus the start limit of 2 × 2.500 € are available
    it('transfers up to the balance plus the free limit and rejects one cent more', () => {
      const engine = newEngine();
      const tick = engine.tick;
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      const values = { ...engine.player.monthlyValues };
      const inflows = structuredClone(engine.player.inflows);
      expect(apply(engine, transfer('acc-1', 'acc-2', 1_500_001))).toEqual({
        ok: false,
        error: 'insufficient-funds',
      });
      ok(engine, transfer('acc-1', 'acc-2', 1_500_000, 'Rücklage Urlaub'));
      expect(apply(engine, transfer('acc-1', 'acc-2', 1))).toEqual({
        ok: false,
        error: 'insufficient-funds',
      });
      expect(engine.drainTransactions().map(entry)).toEqual([
        {
          type: 'transfer',
          postings: [
            ['acc-1', -1_500_000],
            ['acc-2', 1_500_000],
          ],
          params: { purpose: 'Rücklage Urlaub' },
        },
      ]);
      expect(balance(engine, 'acc-1')).toBe(-500_000);
      // Within the limit: uncovered, but not beyond the limit.
      expect(engine.drainEvents()).toEqual([
        { type: 'account-uncovered', tick, accountId: 'acc-1', balance: -500_000, limit: 500_000 },
      ]);
      // Own transfers are no household flows and no deposits from outside (TS §7.4).
      expect(engine.player.monthlyValues).toEqual(values);
      expect(engine.player.inflows).toEqual(inflows);
      expect(engine.drainChangedAccounts()).toEqual(['acc-2', 'acc-1']);
    });

    it('moves a savings balance back in full, but nothing from an empty account', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      expect(apply(engine, transfer('acc-2', 'acc-1', 1))).toEqual({
        ok: false,
        error: 'insufficient-funds',
      });
      ok(engine, transfer('acc-1', 'acc-2', 300_000));
      ok(engine, transfer('acc-2', 'acc-1', 300_000));
      expect(balance(engine, 'acc-2')).toBe(0);
      expect(balance(engine, 'acc-1')).toBe(1_000_000);
    });

    it.each([
      ['the same account', transfer('acc-1', 'acc-1', 100), 'same-account'],
      ['an unknown account', transfer('acc-1', 'acc-7', 100), 'unknown-account'],
      ['an amount of 0', transfer('acc-1', 'acc-2', 0), 'invalid-amount'],
      ['a fractional amount', transfer('acc-1', 'acc-2', 0.5), 'invalid-amount'],
      [
        'a purpose of 141 characters',
        transfer('acc-1', 'acc-2', 100, 'x'.repeat(141)),
        'purpose-too-long',
      ],
    ] as const)('rejects %s', (_label, body, error) => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      engine.drainChangedAccounts();
      const before = engine.snapshot();
      expect(apply(engine, body)).toEqual({ ok: false, error });
      expect(engine.snapshot().player).toEqual(before.player);
      expect(engine.drainTransactions()).toEqual([]);
    });
  });

  describe('closeAccount', () => {
    // TS §7.4: interest up to the day before, fees pro rata up to the closing day, the rest to the
    // target. `acc-2` holds 5.000 € from 02.04.; 01.05. credits April (29 days at 2 %), 01.05. to
    // 09.05. accrue 9 days. `acc-3` paid April on 01.05. (29 of 30 days of 9,90 €, nothing came in
    // from outside) and owes 10 of the 31 days of May.
    it('settles interest and fees up to the closing day and transfers the rest', () => {
      const engine = withSavingsAndCurrent();
      const closing = at(MAY_10, 12);
      engine.runUntil(closing);
      engine.drainTransactions();
      engine.drainEvents();
      const april = Math.round((500_000 * 0.02 * 29) / 365);
      const may = Math.round(((500_000 + april) * 0.02 * 9) / 365);
      const aprilFee = Math.round((990 * 29) / 30);
      const mayFee = Math.round((990 * 10) / 31);
      expect([april, may, aprilFee, mayFee]).toEqual([795, 247, 957, 319]);
      expect(balance(engine, 'acc-2')).toBe(500_000 + april);
      expect(balance(engine, 'acc-3')).toBe(100_000 - aprilFee);
      const acc1 = balance(engine, 'acc-1');

      ok(engine, { type: 'closeAccount', accountId: 'acc-2', targetAccountId: 'acc-1' });
      ok(engine, { type: 'closeAccount', accountId: 'acc-3', targetAccountId: 'acc-1' });
      const savingsRest = 500_000 + april + may;
      const currentRest = 100_000 - aprilFee - mayFee;
      expect(engine.drainTransactions().map(entry)).toEqual([
        {
          type: 'credit-interest',
          postings: [
            ['acc-2', may],
            ['external:bank:b1:interest', -may],
          ],
          params: { from: '2030-05', to: '2030-05' },
        },
        {
          type: 'transfer',
          postings: [
            ['acc-2', -savingsRest],
            ['acc-1', savingsRest],
          ],
          refs: { closedAccountId: 'acc-2' },
        },
        {
          type: 'account-fee',
          postings: [
            ['acc-3', -mayFee],
            ['external:bank:b2:fees', mayFee],
          ],
          params: { month: '2030-05' },
        },
        {
          type: 'transfer',
          postings: [
            ['acc-3', -currentRest],
            ['acc-1', currentRest],
          ],
          refs: { closedAccountId: 'acc-3' },
        },
      ]);
      expect(engine.drainEvents()).toEqual([
        { type: 'interest-credited', tick: closing, accountId: 'acc-2', amount: may, tax: 0 },
      ]);
      expect(balance(engine, 'acc-1')).toBe(acc1 + savingsRest + currentRest);
      expect(balance(engine, 'acc-2')).toBe(0);
      expect(balance(engine, 'acc-3')).toBe(0);
      expect(engine.player.accounts.map(({ closedAt }) => closedAt)).toEqual([
        null,
        closing,
        closing,
      ]);
      expect(engine.player.interest.slice(1)).toEqual([
        { accountId: 'acc-2', credit: 0, debit: 0, pendingCredit: 0, pendingDebit: 0 },
        { accountId: 'acc-3', credit: 0, debit: 0, pendingCredit: 0, pendingDebit: 0 },
      ]);
      expect(engine.player.overdraftLimits.map(({ accountId }) => accountId)).toEqual(['acc-1']);
      expect(accountViews(engine.player, ['acc-3'])).toMatchObject([
        { balance: 0, overdraftLimit: null, available: 0, closedAt: closing },
      ]);

      // Closed accounts earn and pay nothing any more.
      engine.runUntil(at(JUN_3, 6));
      const later = engine.drainTransactions();
      expect(later.length).toBeGreaterThan(0);
      expect(touches(later, 'acc-2')).toBe(false);
      expect(touches(later, 'acc-3')).toBe(false);
    });

    // TS §7.4 closing table: on Saturday, 01.06., the bank run has not settled May yet
    it('previews the fee of the previous month before the bank run, and books exactly the preview', () => {
      const engine = withSavingsAndCurrent();
      engine.runUntil(at(JUN_1, 10));
      engine.drainTransactions();
      engine.drainEvents();
      engine.drainChangedAccounts();
      const before = engine.snapshot();
      const result = engine.closingPreview('acc-3');
      // May 9,90 € (nothing came in from outside), June 1 of 30 days: 0,33 €
      expect(result).toEqual({
        ok: true,
        preview: {
          bookings: [
            { type: 'account-fee', amount: -990, params: { month: '2030-05' } },
            { type: 'account-fee', amount: -33, params: { month: '2030-06' } },
          ],
          remainder: balance(engine, 'acc-3') - 990 - 33,
          blockers: [],
        },
      });
      // The preview books nothing.
      expect(engine.snapshot().player).toEqual(before.player);
      expect(engine.drainTransactions()).toEqual([]);
      expect(engine.drainEvents()).toEqual([]);
      expect(engine.drainChangedAccounts()).toEqual([]);

      const savings = engine.closingPreview('acc-2');
      ok(engine, { type: 'closeAccount', accountId: 'acc-3', targetAccountId: 'acc-1' });
      ok(engine, { type: 'closeAccount', accountId: 'acc-2', targetAccountId: 'acc-1' });
      const booked = engine
        .drainTransactions()
        .filter(({ type }) => type !== 'transfer')
        .map(({ type, postings, params }) => ({ type, amount: postings[0].amount, params }));
      if (!result.ok || !savings.ok) {
        throw new Error('no preview');
      }
      expect(savings.preview.bookings.map(({ type }) => type)).toEqual(['credit-interest']);
      expect(booked).toEqual([...result.preview.bookings, ...savings.preview.bookings]);
    });

    // TS §7.4: a negative balance must be balanced first. 9,60 € cover April's fee of 9,57 €, but
    // not the 3,19 € for May at the closing.
    it('rejects the closing when the balance after the settlement is negative, booking nothing', () => {
      const engine = newEngine();
      engine.runUntil(at(APR_2, 10));
      ok(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' });
      ok(engine, transfer('acc-1', 'acc-2', 960));
      engine.runUntil(at(MAY_10, 12));
      expect(balance(engine, 'acc-2')).toBe(3);
      engine.drainTransactions();
      engine.drainEvents();
      engine.drainChangedAccounts();
      const before = engine.snapshot();
      expect(engine.closingPreview('acc-2')).toEqual({
        ok: true,
        preview: {
          bookings: [{ type: 'account-fee', amount: -319, params: { month: '2030-05' } }],
          remainder: -316,
          blockers: ['negative-balance'],
        },
      });
      expect(
        apply(engine, { type: 'closeAccount', accountId: 'acc-2', targetAccountId: 'acc-1' }),
      ).toEqual({ ok: false, error: 'negative-balance' });
      expect(engine.snapshot().player).toEqual(before.player);
      expect(engine.drainTransactions()).toEqual([]);
      expect(engine.drainEvents()).toEqual([]);
      expect(engine.drainChangedAccounts()).toEqual([]);

      // Balanced to exactly the settlement, it closes without a remainder and without a target.
      ok(engine, transfer('acc-1', 'acc-2', 316));
      ok(engine, { type: 'closeAccount', accountId: 'acc-2' });
      expect(balance(engine, 'acc-2')).toBe(0);
      expect(engine.player.accounts[1].closedAt).toBe(engine.tick);
    });

    // US-BK-03: the salary account closes only after another one was chosen
    it('closes the salary account only after another salary account was chosen', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' });
      expect(engine.closingPreview('acc-1')).toMatchObject({
        ok: true,
        preview: { blockers: ['salary-account'] },
      });
      expect(
        apply(engine, { type: 'closeAccount', accountId: 'acc-1', targetAccountId: 'acc-2' }),
      ).toEqual({ ok: false, error: 'salary-account' });
      ok(engine, { type: 'setSalaryAccount', accountId: 'acc-2' });
      ok(engine, { type: 'closeAccount', accountId: 'acc-1', targetAccountId: 'acc-2' });
      // `b1` charges 12,00 € a month: one day of April's 30, 0,40 €
      expect(balance(engine, 'acc-2')).toBe(1_000_000 - 40);
      // The closed account had the start limit; it has no limit any more.
      expect(engine.player.overdraftLimits).toEqual([]);
    });

    it('closes a clearing account with its depot', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b3', kind: 'depot' });
      ok(engine, { type: 'openAccount', bankId: 'b3', kind: 'depot' });
      ok(engine, transfer('acc-1', 'acc-4', 10_000));
      ok(engine, { type: 'closeAccount', accountId: 'acc-4', targetAccountId: 'acc-1' });
      expect(engine.player.depots.map(({ id, closedAt }) => [id, closedAt])).toEqual([
        ['dep-3', null],
        ['dep-5', engine.tick],
      ]);
      expect(engine.player.accounts[2].closedAt).toBe(engine.tick);
      expect(balance(engine, 'acc-1')).toBe(1_000_000);
      expect(accountViews(engine.player, ['acc-2', 'acc-4']).map(({ depot }) => depot)).toEqual([
        { id: 'dep-3', number: '0000000003' },
        { id: 'dep-5', number: '0000000005' },
      ]);
    });

    it('reports the closed account as changed, also without bookings', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      engine.drainChangedAccounts();
      ok(engine, { type: 'closeAccount', accountId: 'acc-2' });
      expect(engine.drainTransactions()).toEqual([]);
      expect(engine.drainChangedAccounts()).toEqual(['acc-2']);
    });

    it.each([
      ['a remainder without a target', { accountId: 'acc-2' }, 'target-required'],
      [
        'the account itself as target',
        { accountId: 'acc-2', targetAccountId: 'acc-2' },
        'invalid-target',
      ],
      ['an unknown target', { accountId: 'acc-2', targetAccountId: 'acc-9' }, 'invalid-target'],
      ['a closed target', { accountId: 'acc-2', targetAccountId: 'acc-3' }, 'invalid-target'],
      ['a closed account', { accountId: 'acc-3', targetAccountId: 'acc-1' }, 'account-closed'],
      ['an unknown account', { accountId: 'acc-9', targetAccountId: 'acc-1' }, 'unknown-account'],
    ] as const)('rejects %s', (_label, fields, error) => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      ok(engine, transfer('acc-1', 'acc-2', 10_000));
      ok(engine, { type: 'closeAccount', accountId: 'acc-3' });
      const before = engine.snapshot();
      expect(apply(engine, { type: 'closeAccount', ...fields } as Body)).toEqual({
        ok: false,
        error,
      });
      expect(engine.snapshot().player).toEqual(before.player);
    });

    it('previews nothing for unknown or closed accounts', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      ok(engine, { type: 'closeAccount', accountId: 'acc-2' });
      expect(engine.closingPreview('acc-2')).toEqual({ ok: false, error: 'account-closed' });
      expect(engine.closingPreview('acc-9')).toEqual({ ok: false, error: 'unknown-account' });
    });
  });

  describe('setSalaryAccount', () => {
    // US-BK-05, TS §7.4: salary and living costs follow the salary account; the limits follow the
    // salary over three months, from the next bank run on
    it('pays the salary into the new account and charges the living costs there', () => {
      const engine = newEngine();
      engine.runUntil(at(APR_2, 10));
      ok(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' });
      engine.drainChangedAccounts();
      ok(engine, { type: 'setSalaryAccount', accountId: 'acc-2' });
      expect(engine.drainChangedAccounts()).toEqual(['acc-1', 'acc-2']);
      expect(engine.player.overdraftLimits).toEqual([{ accountId: 'acc-1', limit: 500_000 }]);
      engine.drainTransactions();
      engine.runUntil(at(MAY_1, 6));
      const booked = engine
        .drainTransactions()
        .map(({ type, postings }) => [type, postings[0].account]);
      // The salary of April came in from outside, so `acc-2` pays no fee for April.
      expect(booked).toEqual([
        ['salary', 'acc-2'],
        ['living-costs', 'acc-2'],
        ['account-fee', 'acc-1'],
      ]);
      // TS §7.4 limit table: February to April at `b1` 5.000 €, April at `b2` 2.500 €
      expect(engine.player.overdraftLimits).toEqual([
        { accountId: 'acc-1', limit: 333_300 },
        { accountId: 'acc-2', limit: 166_600 },
      ]);
      expect(engine.drainChangedAccounts()).toEqual(expect.arrayContaining(['acc-1', 'acc-2']));
    });

    it.each([
      ['a savings account', 'acc-2', 'not-a-current-account'],
      ['a clearing account', 'acc-3', 'not-a-current-account'],
      ['an unknown account', 'acc-9', 'unknown-account'],
      ['a closed current account', 'acc-5', 'account-closed'],
    ] as const)('rejects %s', (_label, accountId, error) => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      ok(engine, { type: 'openAccount', bankId: 'b3', kind: 'depot' });
      ok(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' });
      ok(engine, transfer('acc-1', 'acc-5', 1_000));
      ok(engine, { type: 'closeAccount', accountId: 'acc-5', targetAccountId: 'acc-1' });
      expect(apply(engine, { type: 'setSalaryAccount', accountId })).toEqual({ ok: false, error });
      expect(engine.player.salaryAccountId).toBe('acc-1');
    });

    it('accepts the current salary account again without a change', () => {
      const engine = newEngine();
      ok(engine, { type: 'setSalaryAccount', accountId: 'acc-1' });
      expect(engine.drainChangedAccounts()).toEqual([]);
    });
  });

  describe('accountViews and netWorth', () => {
    it('shows every account with its depot, limit, available amount and salary flag', () => {
      const engine = newEngine();
      const tick = engine.tick;
      ok(engine, { type: 'openAccount', bankId: 'b3', kind: 'depot' });
      ok(engine, { type: 'openAccount', bankId: 'b2', kind: 'current' });
      ok(engine, transfer('acc-1', 'acc-2', 200_000));
      expect(accountViews(engine.player)).toEqual([
        {
          id: 'acc-1',
          kind: 'current',
          bankId: 'b1',
          number: '0000000001',
          depot: null,
          openedAt: tick,
          closedAt: null,
          balance: 800_000,
          overdraftLimit: 500_000,
          available: 1_300_000,
          reserved: 0,
          salaryAccount: true,
        },
        {
          id: 'acc-2',
          kind: 'clearing',
          bankId: 'b3',
          number: '0000000002',
          depot: { id: 'dep-3', number: '0000000003' },
          openedAt: tick,
          closedAt: null,
          balance: 200_000,
          overdraftLimit: null,
          available: 200_000,
          reserved: 0,
          salaryAccount: false,
        },
        {
          id: 'acc-4',
          kind: 'current',
          bankId: 'b2',
          number: '0000000004',
          depot: null,
          openedAt: tick,
          closedAt: null,
          balance: 0,
          overdraftLimit: 0,
          available: 0,
          reserved: 0,
          salaryAccount: false,
        },
      ]);
      expect(accountViews(engine.player, ['acc-4', 'acc-2']).map(({ id }) => id)).toEqual([
        'acc-2',
        'acc-4',
      ]);
      // M3: the net worth is the sum of the balances (TS §7.9); transfers don't change it.
      expect(netWorth(engine.player)).toBe(1_000_000);
      ok(engine, transfer('acc-1', 'acc-4', 1_300_000));
      expect(netWorth(engine.player)).toBe(1_000_000);
      expect(accountViews(engine.player, ['acc-1'])).toMatchObject([
        { balance: -500_000, available: 0 },
      ]);
    });
  });
});
