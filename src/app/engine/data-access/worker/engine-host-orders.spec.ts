import { AccountView } from '@app/engine/domain/models/account-view.model';
import { TradingProjection } from '@app/engine/domain/models/trading-view.model';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { OrderSpec } from '@app/trading/domain/models/order.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { Exchange } from '@app/world/domain/models/taxonomy.model';

import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { ProjectionPayload } from '../service/engine-service.model';
import {
  advance,
  FINE,
  GAME_START,
  HostHarness,
  MINI_PLAYER as PLAYER,
  runUntil,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Orders through the worker host (AP 5.1, TS §7.5, §8.2–§8.5, §9.2) on the mini world `mini-1`:
// a depot at a bank without current accounts, funded from the salary account, and the first share
// of the world. The game starts on Monday 01.04.2030 at 00:00, before every exchange opens.

const { world } = generateMiniWorld(PLAYER.seed);
const BROKER = world.banks.find(({ conditions }) => conditions.currentAccount === null) as Bank;
const SHARE = world.companies[0];
const EXCHANGE = world.exchanges.find(({ id }) => id === SHARE.exchangeId) as Exchange;
/** Monday, half an hour after the share's exchange opened. */
const OPEN = GAME_START + EXCHANGE.open + 30;
const ONE = 1_000_000;
const FUNDS = 500_000;

const DEPOT = 'dep-3';
const CLEARING = 'acc-2';

/** A purchase of one share that waits far below any price (1 cent). */
const WAITING_BUY: OrderSpec = {
  depotId: DEPOT,
  instrumentId: SHARE.id,
  side: 'buy',
  type: 'limit',
  size: { kind: 'quantity', quantity: ONE },
  limit: 0.01,
  stop: null,
  validity: { kind: 'gtc' },
};

const MARKET_BUY: OrderSpec = {
  ...WAITING_BUY,
  type: 'market',
  limit: null,
  validity: { kind: 'day' },
};

function projections(harness: HostHarness): ProjectionPayload[] {
  return harness.events('projection').map(({ payload }) => payload);
}

/** The trading parts of the projections since message `from`. */
function tradingParts(harness: HostHarness, from = 0): TradingProjection[] {
  return harness.sent
    .slice(from)
    .flatMap(({ message }) =>
      message.type === 'projection' && message.payload.trading !== undefined
        ? [message.payload.trading]
        : [],
    );
}

function clearing(harness: HostHarness): AccountView {
  const views = projections(harness).flatMap(({ accounts }) => accounts);
  return views.filter(({ id }) => id === CLEARING).at(-1) as AccountView;
}

function notified(harness: HostHarness): GameNotification[] {
  return harness.events('notification').flatMap(({ payload }) => payload.notifications);
}

/** Loads the player and opens the depot `dep-3` with the clearing account `acc-2` and 5.000 €. */
async function withDepot(harness: HostHarness): Promise<void> {
  await harness.send('loadPlayer', PLAYER);
  await harness.send('openAccount', { bankId: BROKER.id, kind: 'depot' });
  await harness.send('transfer', {
    fromAccountId: 'acc-1',
    toAccountId: CLEARING,
    amount: FUNDS,
    purpose: 'Depot',
  });
}

async function jumpTo(harness: HostHarness, tick: number): Promise<void> {
  await harness.send('jumpTo', { target: { kind: 'date', tick } });
  await runUntil(harness, () =>
    harness.progress.some(({ kind, state }) => kind === 'jump' && state === 'done'),
  );
  await advance(harness, 500);
}

describe('EngineHost orders', () => {
  it('sends no orders and the empty depots with the full projection', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', PLAYER);
    expect(projections(harness)[0]).toMatchObject({
      full: true,
      trading: { orders: [], depots: [] },
    });
    await harness.send('openAccount', { bankId: BROKER.id, kind: 'depot' });
    // A new depot without holdings changes nothing the trading part holds.
    expect(tradingParts(harness)).toHaveLength(1);
  });

  describe('US-HD-01–04: placeOrder, changeOrder, cancelOrder', () => {
    it('answers with the order ID and sends the order and its reservation before the reply', async () => {
      const harness = new HostHarness({ config: FINE });
      await withDepot(harness);
      const from = harness.sent.length;
      expect(await harness.send('placeOrder', { order: WAITING_BUY })).toEqual({
        ok: true,
        data: { tick: GAME_START, orderId: 'ord-1' },
      });
      const after = harness.sent.slice(from).map(({ message }) => message.type);
      expect(after.indexOf('projection')).toBeLessThan(after.indexOf('reply'));
      const [part] = tradingParts(harness, from);
      expect(part).toEqual({
        orders: [
          {
            ...WAITING_BUY,
            id: 'ord-1',
            status: 'open',
            placedAt: GAME_START,
            expiresAt: expect.any(Number),
            reserved: expect.any(Number),
            triggeredAt: null,
            execution: null,
            closedAt: null,
            rejection: null,
          },
        ],
        depots: [{ depotId: DEPOT, positions: [] }],
      });
      // TS §7.5: the reservation lowers the available amount of the clearing account.
      const reserved = part.orders[0].reserved;
      expect(reserved).toBeGreaterThan(0);
      expect(clearing(harness)).toMatchObject({
        balance: FUNDS,
        reserved,
        available: FUNDS - reserved,
      });
    });

    it('sends only the changed order with its depot', async () => {
      const harness = new HostHarness({ config: FINE });
      await withDepot(harness);
      await harness.send('placeOrder', { order: WAITING_BUY });
      await harness.send('placeOrder', { order: { ...WAITING_BUY, limit: 0.02 } });

      let from = harness.sent.length;
      expect(
        await harness.send('changeOrder', { orderId: 'ord-1', change: { limit: 0.03 } }),
      ).toEqual({ ok: true, data: { tick: GAME_START } });
      expect(tradingParts(harness, from)).toEqual([
        {
          orders: [expect.objectContaining({ id: 'ord-1', status: 'open', limit: 0.03 })],
          depots: [{ depotId: DEPOT, positions: [] }],
        },
      ]);

      from = harness.sent.length;
      expect(await harness.send('cancelOrder', { orderId: 'ord-1' })).toEqual({
        ok: true,
        data: { tick: GAME_START },
      });
      const [part] = tradingParts(harness, from);
      expect(part.orders).toEqual([
        expect.objectContaining({
          id: 'ord-1',
          status: 'cancelled',
          closedAt: GAME_START,
          reserved: 0,
        }),
      ]);
      // Only the reservation of the second order remains.
      const second = tradingParts(harness)
        .flatMap(({ orders }) => orders)
        .filter(({ id }) => id === 'ord-2')
        .at(-1);
      expect(clearing(harness).reserved).toBe(second?.reserved);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['an unknown depot', { ...WAITING_BUY, depotId: 'dep-99' }, 'unknown-depot'],
      ['an unknown instrument', { ...WAITING_BUY, instrumentId: 'nope' }, 'unknown-instrument'],
      ['a limit order without limit', { ...WAITING_BUY, limit: null }, 'invalid-limit'],
      [
        'more money than the clearing account holds',
        { ...WAITING_BUY, limit: 1_000_000 },
        'insufficient-funds',
      ],
      ['an unknown side', { ...WAITING_BUY, side: 'short' }, 'invalid-command'],
    ])('passes the code of %s through', async (_case, spec, error) => {
      const harness = new HostHarness({ config: FINE });
      await withDepot(harness);
      const reply = await harness.send('placeOrder', { order: spec as unknown as OrderSpec });
      expect(reply).toMatchObject({ ok: false, error });
    });

    it('rejects changes and cancellations of closed and unknown orders', async () => {
      const harness = new HostHarness({ config: FINE });
      await withDepot(harness);
      await harness.send('placeOrder', { order: WAITING_BUY });
      await harness.send('cancelOrder', { orderId: 'ord-1' });
      expect(await harness.send('cancelOrder', { orderId: 'ord-1' })).toMatchObject({
        ok: false,
        error: 'order-not-active',
      });
      expect(
        await harness.send('changeOrder', { orderId: 'ord-9', change: { limit: 1 } }),
      ).toMatchObject({ ok: false, error: 'unknown-order' });
      expect(
        await harness.send('changeOrder', { orderId: 'ord-1', change: { limit: '1' as never } }),
      ).toMatchObject({ ok: false, error: 'invalid-command' });
    });

    it('executes a market order at an open exchange before the reply and sends the holding', async () => {
      const harness = new HostHarness({ config: FINE });
      await withDepot(harness);
      await jumpTo(harness, OPEN);
      const at = harness.clock.tick;
      const from = harness.sent.length;
      expect(await harness.send('placeOrder', { order: MARKET_BUY })).toEqual({
        ok: true,
        data: { tick: at, orderId: 'ord-1' },
      });
      const [part] = tradingParts(harness, from);
      expect(part.orders).toEqual([
        expect.objectContaining({ id: 'ord-1', status: 'executed', closedAt: at, reserved: 0 }),
      ]);
      expect(part.depots).toEqual([
        { depotId: DEPOT, positions: [{ instrumentId: SHARE.id, quantity: ONE, free: ONE }] },
      ]);
      const [executed] = notified(harness).filter(({ code }) => code === 'order-executed');
      expect(executed).toMatchObject({
        tick: at,
        params: { orderId: 'ord-1', depotId: DEPOT, instrumentId: SHARE.id, quantity: ONE },
      });
      // The debit with costs leaves the clearing account (TS §7.2).
      const total = executed.code === 'order-executed' ? executed.params.total : 0;
      expect(clearing(harness)).toMatchObject({ balance: FUNDS - total, reserved: 0 });

      // A waiting sell order blocks the share: its depot comes with it.
      await harness.send('placeOrder', {
        order: { ...WAITING_BUY, side: 'sell', limit: 1_000_000 },
      });
      expect(tradingParts(harness).at(-1)?.depots).toEqual([
        { depotId: DEPOT, positions: [{ instrumentId: SHARE.id, quantity: ONE, free: 0 }] },
      ]);
    });

    it('reports an order executed while the app was hidden', async () => {
      const harness = new HostHarness({ config: FINE });
      await withDepot(harness);
      await harness.send('placeOrder', { order: MARKET_BUY });
      await harness.send('setVisibility', { visible: false });
      await jumpTo(harness, OPEN);
      await harness.send('setVisibility', { visible: true });
      const reports = harness.events('report').map(({ payload }) => payload);
      expect(reports).toHaveLength(1);
      const [report] = reports as [AbsenceReport];
      expect(report.orderCount).toBe(1);
      expect(report.orders).toEqual([
        expect.objectContaining({
          code: 'order-executed',
          params: expect.objectContaining({ orderId: 'ord-1' }),
        }),
      ]);
    });
  });

  describe('reloading (TS §9.2)', () => {
    async function reloaded(first: HostHarness): Promise<HostHarness> {
      const second = new HostHarness(
        { config: FINE },
        { storage: new IndexedDbEngineStorage(), startMs: first.timeline.now() },
      );
      await second.send('loadPlayer', { ...PLAYER, minTick: first.clock.tick });
      return second;
    }

    it('keeps orders, history and the reservation after a crash through the write-ahead log', async () => {
      const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
      await withDepot(first);
      await first.send('placeOrder', { order: WAITING_BUY });
      await first.send('placeOrder', { order: { ...WAITING_BUY, limit: 0.02 } });
      await first.send('changeOrder', { orderId: 'ord-1', change: { limit: 0.03 } });
      await first.send('cancelOrder', { orderId: 'ord-2' });
      // Rejected: logged, and rejected again in the replay.
      await first.send('placeOrder', { order: { ...WAITING_BUY, depotId: 'dep-99' } });
      const before = clearing(first);
      first.host.dispose();

      const second = await reloaded(first);
      const [full] = projections(second);
      expect(full.full).toBe(true);
      // Active orders first, then the history.
      expect(full.trading?.orders.map(({ id, status, limit }) => ({ id, status, limit }))).toEqual([
        { id: 'ord-1', status: 'open', limit: 0.03 },
        { id: 'ord-2', status: 'cancelled', limit: 0.02 },
      ]);
      expect(full.trading?.depots).toEqual([{ depotId: DEPOT, positions: [] }]);
      expect(full.accounts.find(({ id }) => id === CLEARING)).toEqual(before);
      // The order counter goes on. The game moves first: the harness numbers its commands from
      // `t1` again, and the engine ignores a command ID it already saw in the same tick.
      await second.send('setSpeed', { speed: '1h' });
      await second.send('resume', {});
      await advance(second, 1_000);
      expect(await second.send('placeOrder', { order: WAITING_BUY })).toMatchObject({
        ok: true,
        data: { orderId: 'ord-3' },
      });
      second.host.dispose();
    });
  });
});
