import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { Bank } from '@app/world/domain/models/bank.model';

import { InMemoryEngineStorage } from './in-memory-engine-storage';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import {
  ProjectionPayload,
  ReplyPayload,
  StatementRequest,
  StatementResult,
} from '../service/engine-service.model';
import {
  advance,
  FINE,
  flushMicrotasks,
  GAME_START,
  HostHarness,
  MINI_PLAYER as PLAYER,
  runUntil,
  gameTick as tick,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Bank commands, queries and projections through the worker host (TS §8.2–§8.5, §9.1) on the mini
// world `mini-1`: the home bank is its first branch bank (TS §5.7), the broker a bank without
// current accounts.

const { world } = generateMiniWorld(PLAYER.seed);
const HOME = world.banks.find(({ type }) => type === 'branch') as Bank;
const BROKER = world.banks.find(({ conditions }) => conditions.currentAccount === null) as Bank;
/** A bank other than the home bank with savings accounts. */
const SAVINGS_BANK = world.banks.find(
  ({ id, conditions }) => id !== HOME.id && conditions.savingsAccount !== null,
) as Bank;
/** TS §7.4: the home bank starts with factor × net income, in whole euros. */
const START_LIMIT =
  Math.floor(
    ((HOME.conditions.currentAccount?.overdraft.limitIncomeFactor ?? 0) * PLAYER.start.netIncome) /
      100,
  ) * 100;

function projections(harness: HostHarness): ProjectionPayload[] {
  return harness.events('projection').map(({ payload }) => payload);
}

function lastProjection(harness: HostHarness): ProjectionPayload {
  return projections(harness).at(-1) as ProjectionPayload;
}

/** Index of the last projection and of the reply to the last command in the posted messages. */
function order(harness: HostHarness): { projection: number; reply: number } {
  const messages = harness.sent.map(({ message }) => message);
  let projection = -1;
  messages.forEach(({ type }, n) => {
    if (type === 'projection') {
      projection = n;
    }
  });
  return {
    projection,
    reply: messages.findIndex(
      (message) => message.type === 'reply' && message.replyTo === harness.lastId,
    ),
  };
}

function ids(accounts: readonly AccountView[]): string[] {
  return accounts.map(({ id }) => id);
}

/** Storage whose reads of an account's transactions wait until `release` is called. */
class GatedStorage extends InMemoryEngineStorage {
  #gate: Promise<void> = Promise.resolve();
  release: () => void = () => undefined;

  close(): void {
    this.#gate = new Promise((resolve) => (this.release = resolve));
  }

  override async loadTransactions(playerId: string, accountId?: AccountId): Promise<Transaction[]> {
    await this.#gate;
    return super.loadTransactions(playerId, accountId);
  }
}

async function statement(
  harness: HostHarness,
  request: Partial<StatementRequest> = {},
): Promise<StatementResult> {
  const reply = await harness.send('query', {
    query: { kind: 'statement', accountId: 'acc-1', offset: 0, limit: 50, ...request },
  });
  if (!reply.ok) {
    throw new Error(`statement failed: ${reply.error}`);
  }
  return reply.data as StatementResult;
}

function seqs(result: StatementResult): number[] {
  return result.entries.map(({ seq }) => seq);
}

function maxInAnySecond(times: readonly number[]): number {
  return Math.max(
    0,
    ...times.map((start) => times.filter((at) => at >= start && at < start + 1_000).length),
  );
}

describe('EngineHost banking', () => {
  describe('projection', () => {
    it('sends all accounts and the net worth after loading, before the reply', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      const { projection, reply } = order(harness);
      expect(projection).toBeGreaterThanOrEqual(0);
      expect(projection).toBeLessThan(reply);
      expect(projections(harness)).toEqual([
        {
          tick: GAME_START,
          full: true,
          accounts: [
            {
              id: 'acc-1',
              kind: 'current',
              bankId: HOME.id,
              number: '0000000001',
              depot: null,
              openedAt: GAME_START,
              closedAt: null,
              balance: PLAYER.start.startCapital,
              overdraftLimit: START_LIMIT,
              available: PLAYER.start.startCapital + START_LIMIT,
              salaryAccount: true,
            },
          ],
          netWorth: PLAYER.start.startCapital,
        },
      ]);
    });

    it('sends the changed accounts after each bank command, before its reply', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);

      expect(await harness.send('openAccount', { bankId: HOME.id, kind: 'savings' })).toEqual({
        ok: true,
        data: { tick: GAME_START, accountId: 'acc-2', depotId: null },
      });
      expect(order(harness).projection).toBeLessThan(order(harness).reply);
      expect(lastProjection(harness)).toMatchObject({ full: false, netWorth: 1_000_000 });
      expect(ids(lastProjection(harness).accounts)).toEqual(['acc-2']);

      expect(
        await harness.send('transfer', {
          fromAccountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: 250_000,
          purpose: 'Notgroschen',
        }),
      ).toEqual({ ok: true, data: { tick: GAME_START } });
      expect(order(harness).projection).toBeLessThan(order(harness).reply);
      expect(lastProjection(harness).accounts).toMatchObject([
        { id: 'acc-1', balance: 750_000, available: 750_000 + START_LIMIT },
        { id: 'acc-2', balance: 250_000, available: 250_000, overdraftLimit: null },
      ]);
      expect(lastProjection(harness).netWorth).toBe(1_000_000);

      expect(await harness.send('openAccount', { bankId: BROKER.id, kind: 'depot' })).toEqual({
        ok: true,
        data: { tick: GAME_START, accountId: 'acc-3', depotId: 'dep-4' },
      });
      expect(lastProjection(harness).accounts).toMatchObject([
        { id: 'acc-3', kind: 'clearing', depot: { id: 'dep-4', number: '0000000004' } },
      ]);

      await harness.send('openAccount', { bankId: HOME.id, kind: 'current' });
      expect(await harness.send('setSalaryAccount', { accountId: 'acc-5' })).toEqual({
        ok: true,
        data: { tick: GAME_START },
      });
      expect(lastProjection(harness).accounts).toMatchObject([
        { id: 'acc-1', salaryAccount: false },
        { id: 'acc-5', salaryAccount: true },
      ]);

      expect(
        await harness.send('closeAccount', { accountId: 'acc-2', targetAccountId: 'acc-1' }),
      ).toEqual({ ok: true, data: { tick: GAME_START } });
      expect(lastProjection(harness).accounts).toMatchObject([
        { id: 'acc-1', balance: 1_000_000 },
        { id: 'acc-2', balance: 0, closedAt: GAME_START, available: 0 },
      ]);
    });

    it('sends at most four projections per second while the game runs', async () => {
      // One pass per tick with tasks: the bank runs, month ends and accruals of four months in
      // passes at the same wall-clock time.
      const harness = new HostHarness({ config: { passBudgetMs: 0 } });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('jumpTo', { target: { kind: 'date', tick: tick(2030, 8, 1) } });
      await runUntil(harness, () =>
        harness.progress.some(({ kind, state }) => kind === 'jump' && state === 'done'),
      );
      await advance(harness, 2_000);
      const times = harness.events('projection').map(({ atMs }) => atMs);
      expect(times.length).toBeGreaterThanOrEqual(2);
      expect(maxInAnySecond(times)).toBeLessThanOrEqual(4);
      // Changes held back go out later: the last projection shows the stored state.
      const { snapshot } = await harness.storage.loadPlayerState(PLAYER.playerId);
      const balances = [...(snapshot?.state.player.balances.values() ?? [])];
      expect(snapshot?.tick).toBe(tick(2030, 8, 1));
      expect(lastProjection(harness).netWorth).toBe(balances.reduce((a, b) => a + b, 0));
      expect(lastProjection(harness).accounts).toMatchObject([
        { id: 'acc-1', balance: snapshot?.state.player.balances.get('acc-1') },
      ]);
    });
  });

  describe('errors', () => {
    it('passes the codes of rejected bank commands on, after writing them ahead', async () => {
      const storage = new InMemoryEngineStorage();
      const harness = new HostHarness({}, { storage });
      await harness.send('loadPlayer', PLAYER);
      const sent = projections(harness).length;
      const replies: ReplyPayload[] = [
        await harness.send('transfer', {
          fromAccountId: 'acc-1',
          toAccountId: 'acc-1',
          amount: 1,
          purpose: '',
        }),
        await harness.send('openAccount', { bankId: BROKER.id, kind: 'current' }),
        await harness.send('closeAccount', { accountId: 'acc-1' }),
        await harness.send('closeAccount', { accountId: 'acc-9' }),
        await harness.send('setSalaryAccount', { accountId: 'acc-7' }),
      ];
      await harness.send('openAccount', { bankId: HOME.id, kind: 'savings' });
      replies.push(
        await harness.send('transfer', {
          fromAccountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: PLAYER.start.startCapital + START_LIMIT + 1,
          purpose: '',
        }),
        await harness.send('transfer', {
          fromAccountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: 0,
          purpose: '',
        }),
        await harness.send('openAccount', { bankId: 'nope', kind: 'depot' }),
      );
      expect(replies.map((reply) => (reply.ok ? 'ok' : reply.error))).toEqual([
        'same-account',
        'account-kind-not-offered',
        'salary-account',
        'unknown-account',
        'unknown-account',
        'insufficient-funds',
        'invalid-amount',
        'unknown-bank',
      ]);
      // Only the opened savings account changed anything.
      expect(
        projections(harness)
          .slice(sent)
          .map(({ accounts }) => ids(accounts)),
      ).toEqual([['acc-2']]);
      const { commands } = await storage.loadPlayerState(PLAYER.playerId);
      expect(commands.map(({ type }) => type)).toEqual([
        'transfer',
        'openAccount',
        'closeAccount',
        'closeAccount',
        'setSalaryAccount',
        'openAccount',
        'transfer',
        'transfer',
        'openAccount',
      ]);
    });
  });

  describe('write-ahead and replay', () => {
    it('restores the accounts and the journal of the bank commands after a crash', async () => {
      const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
      await first.send('loadPlayer', PLAYER);
      await first.send('setSpeed', { speed: '1h' });
      await first.send('resume', {});
      await advance(first, 2_000);
      await first.send('openAccount', { bankId: HOME.id, kind: 'savings' });
      await first.send('transfer', {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 300_000,
        purpose: 'Rücklage',
      });
      // Rejected: logged, and rejected again in the replay.
      await first.send('closeAccount', { accountId: 'acc-2' });
      const before = lastProjection(first);
      first.host.dispose();

      const second = new HostHarness(
        { config: FINE },
        { storage: new IndexedDbEngineStorage(), startMs: first.timeline.now() },
      );
      await second.send('loadPlayer', { ...PLAYER, minTick: first.clock.tick });
      second.host.dispose();
      const restored = lastProjection(second);
      expect(restored.full).toBe(true);
      expect(restored.accounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'acc-2', balance: 300_000, closedAt: null }),
        ]),
      );
      expect(restored.netWorth).toBe(before.netWorth);
      const journal = await new IndexedDbEngineStorage().loadTransactions(PLAYER.playerId, 'acc-2');
      expect(journal.map(({ type, params }) => [type, params])).toEqual([
        ['transfer', { purpose: 'Rücklage' }],
      ]);
    });
  });

  describe('queries', () => {
    it('previews the closing of an account without changing anything', async () => {
      const storage = new InMemoryEngineStorage();
      const harness = new HostHarness({}, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('openAccount', { bankId: HOME.id, kind: 'current' });
      const posted = harness.sent.length;
      const stored = await storage.loadPlayerState(PLAYER.playerId);
      const preview = await harness.send('query', {
        query: { kind: 'closingPreview', accountId: 'acc-2' },
      });
      // TS §7.4: closing at 01.04.2030 00:00, before the bank run, costs 1 of April's 30 days.
      const fee = Math.round((HOME.conditions.currentAccount?.monthlyFee ?? 0) / 30);
      expect(preview).toEqual({
        ok: true,
        data: {
          kind: 'closingPreview',
          preview: {
            bookings: [{ type: 'account-fee', amount: -fee, params: { month: '2030-04' } }],
            remainder: -fee,
            blockers: ['negative-balance'],
          },
        },
      });
      expect(harness.sent.length).toBe(posted + 1);
      expect(await storage.loadPlayerState(PLAYER.playerId)).toEqual(stored);
      expect(
        await harness.send('query', { query: { kind: 'closingPreview', accountId: 'acc-2' } }),
      ).toEqual(preview);
      expect(
        await harness.send('query', { query: { kind: 'closingPreview', accountId: 'acc-9' } }),
      ).toMatchObject({ ok: false, error: 'unknown-account' });
    });

    it('lists the banks of the world with their conditions', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      expect(await harness.send('query', { query: { kind: 'banks' } })).toEqual({
        ok: true,
        data: { kind: 'banks', banks: world.banks },
      });
    });

    it('answers the closed months and the running one', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      const empty = {
        income: 0,
        livingCosts: 0,
        fees: 0,
        creditInterest: 0,
        debitInterest: 0,
        taxes: 0,
        dividends: 0,
      };
      expect(await harness.send('query', { query: { kind: 'monthlyValues' } })).toEqual({
        ok: true,
        data: {
          kind: 'monthlyValues',
          closedMonths: [],
          current: { month: { year: 2030, month: 4 }, values: empty },
        },
      });
      await harness.send('jumpTo', { target: { kind: 'next-month' } });
      await advance(harness, 0);
      const reply = await harness.send('query', { query: { kind: 'monthlyValues' } });
      expect(reply).toMatchObject({
        ok: true,
        data: {
          closedMonths: [
            { month: { year: 2030, month: 4 }, values: { income: PLAYER.start.netIncome } },
          ],
          current: { month: { year: 2030, month: 5 }, values: empty },
        },
      });
    });
  });

  describe('statement', () => {
    /** Opening balance (1), a savings account elsewhere and two transfers (2, 3) at the game start. */
    async function withTransfers(harness: HostHarness): Promise<void> {
      await harness.send('loadPlayer', PLAYER);
      await harness.send('openAccount', { bankId: SAVINGS_BANK.id, kind: 'savings' });
      await harness.send('transfer', {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 250_000,
        purpose: 'Notgroschen',
      });
      await harness.send('transfer', {
        fromAccountId: 'acc-2',
        toAccountId: 'acc-1',
        amount: 12_345,
        purpose: 'Urlaub',
      });
    }

    it('pages, filters and searches the statement of an account', async () => {
      const harness = new HostHarness();
      await withTransfers(harness);

      const all = await statement(harness);
      expect(all).toEqual({
        kind: 'statement',
        total: 3,
        tick: GAME_START,
        entries: [
          {
            seq: 3,
            tick: GAME_START,
            type: 'transfer',
            amount: 12_345,
            balanceAfter: 762_345,
            counterparties: [
              {
                kind: 'own',
                accountId: 'acc-2',
                accountKind: 'savings',
                bankId: SAVINGS_BANK.id,
                number: '0000000002',
              },
            ],
            params: { purpose: 'Urlaub' },
            refs: {},
          },
          expect.objectContaining({ seq: 2, amount: -250_000, balanceAfter: 750_000 }),
          expect.objectContaining({
            seq: 1,
            type: 'opening-balance',
            amount: PLAYER.start.startCapital,
            balanceAfter: PLAYER.start.startCapital,
            counterparties: [
              { kind: 'external', account: 'external:opening-balance', bankId: null },
            ],
          }),
        ],
      });
      expect(await statement(harness, { offset: 1, limit: 1 })).toMatchObject({
        total: 3,
        entries: [{ seq: 2 }],
      });
      expect(seqs(await statement(harness, { types: ['opening-balance'] }))).toEqual([1]);
      expect(seqs(await statement(harness, { from: GAME_START + 1 }))).toEqual([]);
      expect(seqs(await statement(harness, { search: 'notGROSCHEN' }))).toEqual([2]);
      expect(seqs(await statement(harness, { search: SAVINGS_BANK.name.toUpperCase() }))).toEqual([
        3, 2,
      ]);
      expect(seqs(await statement(harness, { search: '123,45' }))).toEqual([3]);
      expect(seqs(await statement(harness, { search: '−2.500' }))).toEqual([2]);
      expect(seqs(await statement(harness, { accountId: 'acc-2', search: '0000000001' }))).toEqual([
        3, 2,
      ]);
    });

    it('includes the transactions not yet written, each once after the write', async () => {
      const harness = new HostHarness();
      await withTransfers(harness);
      expect(
        (await harness.storage.loadTransactions(PLAYER.playerId, 'acc-1')).map(({ seq }) => seq),
      ).toEqual([1]);
      expect(seqs(await statement(harness))).toEqual([3, 2, 1]);

      await advance(harness, 2_000);
      expect(
        (await harness.storage.loadTransactions(PLAYER.playerId, 'acc-1')).map(({ seq }) => seq),
      ).toEqual([1, 2, 3]);
      expect(await statement(harness)).toMatchObject({ total: 3 });
      expect(seqs(await statement(harness))).toEqual([3, 2, 1]);
    });

    it('answers only up to the current tick, whatever the store holds', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      // As after a restore: a stored transaction after the current tick (TS §8.2, §9.2).
      await harness.storage.saveTransactions(PLAYER.playerId, [
        {
          seq: 7,
          tick: GAME_START + 60,
          type: 'salary',
          postings: [
            { account: 'acc-1', amount: 100, balanceAfter: PLAYER.start.startCapital + 100 },
            { account: 'external:employer', amount: -100, balanceAfter: null },
          ],
        },
      ]);
      expect(await statement(harness, { to: GAME_START + 120 })).toMatchObject({
        total: 1,
        tick: GAME_START,
        entries: [{ seq: 1 }],
      });
      expect(seqs(await statement(harness, { from: GAME_START + 1 }))).toEqual([]);
    });

    it('keeps the statement of a closed account readable', async () => {
      const harness = new HostHarness();
      await withTransfers(harness);
      expect(
        await harness.send('closeAccount', { accountId: 'acc-2', targetAccountId: 'acc-1' }),
      ).toMatchObject({ ok: true });
      const closed = await statement(harness, { accountId: 'acc-2' });
      expect(closed.entries[0]).toMatchObject({
        amount: -(250_000 - 12_345),
        balanceAfter: 0,
        counterparties: [{ kind: 'own', accountId: 'acc-1' }],
      });
      expect(closed.entries.slice(1).map(({ seq, amount }) => [seq, amount])).toEqual([
        [3, -12_345],
        [2, 250_000],
      ]);
    });

    it('rejects unknown accounts and pages above the limit', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      expect(
        await harness.send('query', {
          query: { kind: 'statement', accountId: 'acc-9', offset: 0, limit: 10 },
        }),
      ).toMatchObject({ ok: false, error: 'unknown-account' });
      expect(
        await harness.send('query', {
          query: { kind: 'statement', accountId: 'acc-1', offset: 0, limit: 201 },
        }),
      ).toMatchObject({ ok: false, error: 'invalid-command' });
    });

    it('does not hold the clock while it reads the store', async () => {
      const storage = new GatedStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});

      storage.close();
      const reply = harness.send('query', {
        query: { kind: 'statement', accountId: 'acc-1', offset: 0, limit: 10 },
      });
      await flushMicrotasks();
      await advance(harness, 2_000);
      const during = harness.clock.tick;
      storage.release();
      const result = await reply;
      expect(result).toMatchObject({ ok: true, data: { total: 1 } });
      // The answer holds the tick at which the query started; the clock went on meanwhile.
      expect((result.ok && (result.data as StatementResult).tick) || 0).toBeLessThan(during);
    });
  });

  describe('runtime', () => {
    it('stores the net worth with the clock state for the player list', async () => {
      const harness = new HostHarness({}, { storage: new IndexedDbEngineStorage() });
      await harness.send('loadPlayer', PLAYER);
      await harness.host.settled();
      const database = await openPortfoligoDb();
      expect(await database.get('runtime', PLAYER.playerId)).toMatchObject({
        tick: GAME_START,
        netWorth: PLAYER.start.startCapital,
      });
      await harness.send('jumpTo', { target: { kind: 'next-month' } });
      await advance(harness, 0);
      const { snapshot } = await harness.storage.loadPlayerState(PLAYER.playerId);
      const sum = [...(snapshot?.state.player.balances.values() ?? [])].reduce((a, b) => a + b, 0);
      // April brought the salary and took the living costs and the fee.
      expect(sum).not.toBe(PLAYER.start.startCapital);
      expect(await database.get('runtime', PLAYER.playerId)).toMatchObject({
        tick: tick(2030, 5, 1),
        netWorth: sum,
      });
      database.close();
    });
  });
});
