import { isPlayerAccount } from '@app/banking/domain/ledger-logic';
import { MonthlyValues } from '@app/banking/domain/models/household.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { GameState } from '@app/engine/domain/models/game-state.model';
import { indexSeries } from '@app/market/domain/series';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { EngineStorage } from './engine-host.model';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

import { NotificationsResult, ProjectionPayload } from '../service/engine-service.model';
import {
  advance,
  FINE,
  GAME_START,
  gameTick,
  HostHarness,
  MINI_PLAYER,
  runUntil,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Notifications, auto-pause and absence report through the worker host (TS §3.6, §8.2, §8.3, §9.2,
// §12; US-BN-01–03, US-ZT-06) on the mini world. The overdrawn player has living costs far beyond
// the overdraft limit of the home bank, so the first bank run on Monday, 01.04.2030, 06:00 makes
// the salary account uncovered (warning) and exceeds the limit (critical, auto-pause by default).

const OVERDRAWN = {
  ...MINI_PLAYER,
  start: { startCapital: 0, netIncome: 100_000, livingCosts: 5_000_000 },
};
const BANK_RUN = gameTick(2030, 4, 1, 6);
const MAY_1 = gameTick(2030, 5, 1);
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const { seedKey, world } = generateMiniWorld(MINI_PLAYER.seed);
const SAVINGS_BANK = world.banks.find(
  ({ conditions }) => conditions.savingsAccount !== null,
) as Bank;

function notified(harness: HostHarness): GameNotification[] {
  return harness.events('notification').flatMap(({ payload }) => payload.notifications);
}

function reports(harness: HostHarness): AbsenceReport[] {
  return harness.events('report').map(({ payload }) => payload);
}

function lastProjection(harness: HostHarness): ProjectionPayload {
  return harness.events('projection').at(-1)?.payload as ProjectionPayload;
}

/** The last projection that carried the notification part. */
function notificationPart(harness: HostHarness): ProjectionPayload['notifications'] {
  return harness
    .events('projection')
    .map(({ payload }) => payload.notifications)
    .filter((part) => part !== undefined)
    .at(-1);
}

async function notificationPage(
  harness: HostHarness,
  request: { offset?: number; limit?: number; category?: 'account' | 'system' } = {},
): Promise<NotificationsResult> {
  const reply = await harness.send('query', {
    query: { kind: 'notifications', offset: 0, limit: 50, ...request },
  });
  if (!reply.ok) {
    throw new Error(`notifications failed: ${reply.error}`);
  }
  return reply.data as NotificationsResult;
}

function jumpEnded(harness: HostHarness): boolean {
  return harness.progress.some(({ kind, state }) => kind === 'jump' && state !== 'running');
}

/** Loads the player and leaves it running at `speed` with the app visible. */
async function running(
  harness: HostHarness,
  player = OVERDRAWN,
  speed: '1h' | '1d' = '1h',
): Promise<void> {
  await harness.send('loadPlayer', player);
  await harness.send('setSpeed', { speed });
  await harness.send('resume', {});
}

/**
 * Household flows of a journal by booking type, independent of the counterparty rules of the
 * monthly values: the amounts on the player's accounts.
 */
function flowsByType(journal: readonly Transaction[]): MonthlyValues {
  const own = (transaction: Transaction): number =>
    transaction.postings
      .filter(({ account }) => isPlayerAccount(account))
      .reduce((sum, { amount }) => sum + amount, 0);
  const total = (...types: string[]): number =>
    journal.filter(({ type }) => types.includes(type)).reduce((sum, t) => sum + own(t), 0);
  return {
    income: total('salary'),
    livingCosts: 0 - total('living-costs'),
    fees: 0 - total('account-fee'),
    creditInterest: total('credit-interest'),
    debitInterest: 0 - total('overdraft-interest', 'debit-interest'),
    taxes: 0 - total('tax', 'tax-refund'),
    dividends: 0,
    orderFees: 0,
    savingsPlanFees: 0,
    accountFees: 0 - total('account-fee'),
    custodyFees: 0,
    spreadCosts: 0,
    terCosts: 0,
  };
}

describe('EngineHost notifications', () => {
  describe('auto-pause (US-ZT-06)', () => {
    it('pauses live and visible at the tick of the critical notification', async () => {
      const harness = new HostHarness({ config: FINE });
      await running(harness);
      await advance(harness, 10_000);
      // The clock event waits for the clock write, which settles after the timers of `advance`.
      await advance(harness, 100);

      expect(harness.clock).toMatchObject({
        tick: BANK_RUN,
        paused: true,
        effectiveSpeed: null,
        autoPause: { seq: 2, code: 'overdraft-limit-exceeded' },
      });
      expect(notified(harness).map(({ seq, tick, code }) => [seq, tick, code])).toEqual([
        [1, BANK_RUN, 'account-uncovered'],
        [2, BANK_RUN, 'overdraft-limit-exceeded'],
      ]);
      expect(
        (harness.storage as InMemoryEngineStorage).clocks.get(OVERDRAWN.playerId),
      ).toMatchObject({ tick: BANK_RUN, paused: true });
      expect(notificationPart(harness)).toMatchObject({ lastSeq: 2, unread: 2 });

      await harness.send('resume', {});
      await advance(harness, 1_000);
      expect(harness.clock.paused).toBe(false);
      expect(harness.clock.autoPause).toBeUndefined();
      expect(harness.clock.tick).toBeGreaterThan(BANK_RUN);
    });

    it('does not pause once the player switched the auto-pause off', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', OVERDRAWN);
      expect(
        await harness.send('setAutoPause', { code: 'overdraft-limit-exceeded', enabled: false }),
      ).toEqual({ ok: true, data: { tick: GAME_START } });
      expect(notificationPart(harness)?.autoPause['overdraft-limit-exceeded']).toBe(false);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await advance(harness, 10_000);

      expect(harness.clock).toMatchObject({ paused: false });
      expect(harness.clock.tick).toBeGreaterThan(BANK_RUN);
      expect(notified(harness)).toHaveLength(2);
    });

    it('does not pause while hidden and reports the warnings when the app is visible again', async () => {
      const harness = new HostHarness({ config: { loopIntervalMs: 60_000 } });
      await running(harness);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 7 * HOUR_MS);

      expect(harness.clock).toMatchObject({ paused: false, effectiveSpeed: 'realtime' });
      expect(harness.clock.tick).toBeGreaterThan(BANK_RUN);
      expect(notified(harness)).toHaveLength(2);
      expect(reports(harness)).toEqual([]);

      await harness.send('setVisibility', { visible: true });
      const [report] = reports(harness);
      expect(report).toMatchObject({
        from: GAME_START,
        netWorthBefore: 0,
        notifications: 2,
        warningCount: 2,
        warnings: notified(harness),
      });
      expect(report.to).toBe(harness.clock.tick);
      expect(report.netWorthAfter).toBe(lastProjection(harness).netWorth);
    });

    it('sends no report when nothing happened while hidden', async () => {
      const harness = new HostHarness({ config: FINE });
      await running(harness);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 10_000);
      await harness.send('setVisibility', { visible: true });
      expect(reports(harness)).toEqual([]);
    });

    it('ends a jump at the auto-pause and keeps the game paused', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', OVERDRAWN);
      await harness.send('jumpTo', { target: { kind: 'next-month' } });
      await runUntil(harness, () => jumpEnded(harness));
      await advance(harness, 100);

      expect(harness.progress.filter(({ kind }) => kind === 'jump').at(-1)).toMatchObject({
        state: 'cancelled',
        done: BANK_RUN - GAME_START,
      });
      expect(harness.clock).toMatchObject({
        tick: BANK_RUN,
        paused: true,
        jumping: false,
        autoPause: { seq: 2, code: 'overdraft-limit-exceeded' },
      });
    });

    it('runs a jump on while hidden and reports its notifications when visible again', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', OVERDRAWN);
      await harness.send('setVisibility', { visible: false });
      await harness.send('jumpTo', { target: { kind: 'next-month' } });
      await runUntil(harness, () => jumpEnded(harness));
      // Hidden, the clock event goes out at most once per second.
      await advance(harness, 1_000);

      expect(harness.progress.filter(({ kind }) => kind === 'jump').at(-1)).toMatchObject({
        state: 'done',
        done: MAY_1 - GAME_START,
      });
      expect(harness.clock).toMatchObject({ tick: MAY_1, jumping: false });
      expect(harness.clock.autoPause).toBeUndefined();

      await harness.send('setVisibility', { visible: true });
      const [report] = reports(harness);
      expect(report.from).toBe(GAME_START);
      expect(report.to).toBe(MAY_1);
      expect(report.warnings).toEqual([
        expect.objectContaining({ seq: 1, tick: BANK_RUN, code: 'account-uncovered' }),
        expect.objectContaining({ seq: 2, tick: BANK_RUN, code: 'overdraft-limit-exceeded' }),
      ]);
    });

    it('does not pause while catching up and reports the period afterwards', async () => {
      const storage = new InMemoryEngineStorage();
      const first = new HostHarness({ config: FINE }, { storage });
      await running(first);
      await first.send('unloadPlayer', {});

      const second = new HostHarness(
        { config: FINE },
        { storage, startMs: first.timeline.now() + 7 * HOUR_MS },
      );
      await second.send('loadPlayer', OVERDRAWN);
      await runUntil(second, () =>
        second.progress.some(({ kind, state }) => kind === 'catch-up' && state === 'done'),
      );
      await advance(second, 100);

      expect(second.clock.paused).toBe(false);
      expect(second.clock.autoPause).toBeUndefined();
      expect(notified(second)).toEqual([]);
      const [report] = reports(second);
      expect(report).toMatchObject({
        from: GAME_START,
        to: GAME_START + 7 * 60,
        notifications: 2,
        warningCount: 2,
      });
      expect(report.warnings.map(({ code }) => code)).toEqual([
        'account-uncovered',
        'overdraft-limit-exceeded',
      ]);
      const reply = await second.send('query', { query: { kind: 'absenceReport' } });
      expect(reply).toEqual({ ok: true, data: { kind: 'absenceReport', report } });
    });
  });

  describe('absence report (US-BN-03)', () => {
    it('reports a month of absence with the values of an independent run', async () => {
      const storage = new InMemoryEngineStorage();
      const first = new HostHarness({}, { storage });
      await first.send('loadPlayer', MINI_PLAYER);
      await first.send('resume', {});
      await first.send('unloadPlayer', {});
      const second = new HostHarness({}, { storage, startMs: first.timeline.now() + 30 * DAY_MS });
      await second.send('loadPlayer', MINI_PLAYER);
      await runUntil(second, () => reports(second).length > 0);

      const engine = GameEngine.start(createGameWorld(seedKey, world), MINI_PLAYER.start);
      engine.drainTransactions();
      const kinds = world.indices.map(({ kind }) => kind);
      const selected = [
        ...kinds.flatMap((kind, x) => (kind === 'world' ? [x] : [])),
        ...kinds.flatMap((kind, x) => (kind === 'region-broad' ? [x] : [])),
      ].map((x) => ({ x, series: indexSeries(engine.world.context, x) }));
      const start = selected.map(({ series }) =>
        engine.prices.priceAt(series, GAME_START, GAME_START),
      );
      engine.runUntil(MAY_1);
      const journal = engine.drainTransactions();
      const balances = [...(engine.snapshot() as GameState).player.balances.values()];

      expect(reports(second)).toEqual<AbsenceReport[]>([
        {
          from: GAME_START,
          to: MAY_1,
          netWorthBefore: MINI_PLAYER.start.startCapital,
          netWorthAfter: balances.reduce((sum, balance) => sum + balance, 0),
          flows: flowsByType(journal),
          bookings: journal.length,
          notifications: 1,
          warnings: [],
          warningCount: 0,
          orders: [],
          orderCount: 0,
          indices: selected.map(({ x, series }, n) => ({
            series,
            id: world.indices[x].id,
            name: world.indices[x].name,
            start: start[n],
            end: engine.prices.priceAt(series, MAY_1, MAY_1),
          })),
        },
      ]);
      expect(selected.length).toBeGreaterThan(1);
      expect(journal.map(({ type }) => type)).toContain('living-costs');
    });
  });

  describe('centre (US-BN-01)', () => {
    it('pages the notifications with read state and category and marks them read', async () => {
      const harness = new HostHarness({ config: FINE });
      await running(harness, OVERDRAWN, '1d');
      await harness.send('setAutoPause', { code: 'overdraft-limit-exceeded', enabled: false });
      await advance(harness, 31_000);

      const all = await notificationPage(harness);
      expect(all.tick).toBe(harness.clock.tick);
      expect(all.entries.map(({ seq }) => seq)).toEqual(
        Array.from({ length: all.total }, (_, n) => all.total - n),
      );
      expect(all.entries.every(({ read }) => !read)).toBe(true);
      const system = await notificationPage(harness, { category: 'system' });
      expect(system.entries.map(({ code }) => code)).toEqual(['month-closed']);
      const page = await notificationPage(harness, { category: 'account', offset: 1, limit: 1 });
      expect(page.entries.map(({ seq }) => seq)).toEqual([1]);

      expect(await harness.send('markNotificationsRead', { seqs: [2] })).toMatchObject({
        ok: true,
      });
      expect(notificationPart(harness)?.unread).toBe(all.total - 1);
      expect((await notificationPage(harness, { limit: all.total })).entries.at(-2)?.read).toBe(
        true,
      );
      expect(await harness.send('markNotificationsRead', { upTo: all.total + 1 })).toMatchObject({
        ok: false,
        error: 'unknown-notification',
      });
      await harness.send('markNotificationsRead', { upTo: all.total });
      expect(notificationPart(harness)).toMatchObject({ lastSeq: all.total, unread: 0 });
    });

    it('answers invalid-command for a page beyond the limit and an empty read request', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', OVERDRAWN);
      expect(
        await harness.send('query', { query: { kind: 'notifications', offset: 0, limit: 201 } }),
      ).toMatchObject({ ok: false, error: 'invalid-command' });
      expect(await harness.send('markNotificationsRead', {})).toMatchObject({
        ok: false,
        error: 'invalid-command',
      });
    });
  });

  describe('storage (TS §9.1, §9.2)', () => {
    /** A stored game whose counter stands at `count` with `count` stored notifications. */
    async function withStoredNotifications(storage: EngineStorage, count: number): Promise<void> {
      const first = new HostHarness({}, { storage });
      await first.send('loadPlayer', MINI_PLAYER);
      await first.send('unloadPlayer', {});
      const { snapshot } = await storage.loadPlayerState(MINI_PLAYER.playerId);
      const state = structuredClone(snapshot?.state) as GameState;
      state.player.notifications.nextSeq = count + 1;
      const old = Array.from({ length: count }, (_, n): GameNotification => ({
        seq: n + 1,
        tick: GAME_START,
        code: 'interest-credited',
        params: { accountId: 'acc-1', amount: n, tax: 0 },
      }));
      await storage.saveSnapshot(MINI_PLAYER.playerId, state, { notifications: old });
    }

    async function storedSeqs(storage: EngineStorage): Promise<number[]> {
      return (await storage.loadNotifications(MINI_PLAYER.playerId)).map(({ seq }) => seq);
    }

    it('keeps 1.000 and restores without gaps after the store lost the newest', async () => {
      const storage = new InMemoryEngineStorage();
      await withStoredNotifications(storage, 1_000);
      const config = { ...FINE, snapshotIntervalMs: 600_000 };

      const running1d = new HostHarness({ config }, { storage });
      await running(running1d, MINI_PLAYER, '1d');
      await advance(running1d, 31_000);
      // Stored within 1 s; the snapshot of hiding deletes the oldest.
      expect((await storedSeqs(storage)).at(-1)).toBe(1_001);
      await running1d.send('setVisibility', { visible: false });
      await running1d.send('setVisibility', { visible: true });
      await running1d.host.settled();
      const kept = await storedSeqs(storage);
      expect(kept).toEqual(Array.from({ length: 1_000 }, (_, n) => n + 2));

      await advance(running1d, 31_000);
      const june = (await storage.loadNotifications(MINI_PLAYER.playerId)).at(-1);
      expect(june).toMatchObject({ seq: 1_002, code: 'month-closed' });
      running1d.host.dispose();

      const restoring = new HostHarness({ config }, { storage, startMs: running1d.timeline.now() });
      await restoring.send('loadPlayer', MINI_PLAYER);
      await restoring.host.settled();
      expect(await storedSeqs(storage)).toEqual(Array.from({ length: 1_000 }, (_, n) => n + 3));
      expect((await storage.loadNotifications(MINI_PLAYER.playerId)).at(-1)).toEqual(june);
      const page = await notificationPage(restoring, { limit: 200 });
      expect(page.total).toBe(1_000);
      expect(notificationPart(restoring)).toMatchObject({ lastSeq: 1_002, unread: 1_000 });
    });

    it('sends the notification of a command before the reply and stores it within 1 s', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', MINI_PLAYER);
      const opened = await harness.send('openAccount', {
        bankId: SAVINGS_BANK.id,
        kind: 'savings',
      });
      expect(opened).toMatchObject({ ok: true, data: { accountId: 'acc-2' } });
      await harness.send('transfer', {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: MINI_PLAYER.start.startCapital + 1,
        purpose: '',
      });
      const messages = harness.sent.map(({ message }) => message);
      const event = messages.findIndex(({ type }) => type === 'notification');
      const reply = messages.findIndex(
        (message) => message.type === 'reply' && message.replyTo === harness.lastId,
      );
      expect(event).toBeGreaterThanOrEqual(0);
      expect(event).toBeLessThan(reply);
      expect(notified(harness)).toEqual<GameNotification[]>([
        {
          seq: 1,
          tick: GAME_START,
          code: 'account-uncovered',
          params: { accountId: 'acc-1', balance: -1, limit: expect.any(Number) },
        },
      ]);
      expect(await storedSeqs(harness.storage)).toEqual([]);
      await advance(harness, 1_000);
      expect(await storedSeqs(harness.storage)).toEqual([1]);
    });
  });
});
