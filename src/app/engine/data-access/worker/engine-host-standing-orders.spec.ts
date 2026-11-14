import { StandingOrderSpec } from '@app/banking/domain/models/standing-order.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { ProjectionPayload } from '../service/engine-service.model';
import {
  advance,
  FINE,
  GAME_START,
  gameTick,
  HostHarness,
  MINI_PLAYER as PLAYER,
  runUntil,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Standing orders through the worker host (AP 5.6a, TS §7.4, §8.2–§8.5): commands written ahead,
// the projection of all standing orders with their next execution, and the execution during the
// catch-up after an absence (TS §3.7).

const { world } = generateMiniWorld(PLAYER.seed);
const HOME = world.banks.find(({ type }) => type === 'branch') as Bank;
const HOUR_MS = 3_600_000;

/** Tuesday, 02.04.2030, a bank working day without other bookings. */
const MONTHLY: StandingOrderSpec = {
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 25_000,
  day: 2,
  purpose: 'Rücklage',
};

function projections(harness: HostHarness): ProjectionPayload[] {
  return harness.events('projection').map(({ payload }) => payload);
}

function lastProjection(harness: HostHarness): ProjectionPayload {
  return projections(harness).at(-1) as ProjectionPayload;
}

function catchUpDone(harness: HostHarness): boolean {
  return harness.progress.some(({ kind, state }) => kind === 'catch-up' && state === 'done');
}

describe('EngineHost standing orders', () => {
  it('projects the standing orders after loading and after each command, before its reply', async () => {
    const harness = new HostHarness();
    await harness.send('loadPlayer', PLAYER);
    expect(lastProjection(harness)).toMatchObject({ full: true, standingOrders: [] });
    await harness.send('openAccount', { bankId: HOME.id, kind: 'savings' });
    expect(lastProjection(harness).standingOrders).toBeUndefined();

    expect(await harness.send('createStandingOrder', { order: MONTHLY })).toEqual({
      ok: true,
      data: { tick: GAME_START, standingOrderId: 'so-1' },
    });
    const created = harness.sent.findIndex(
      ({ message }) => message.type === 'reply' && message.replyTo === harness.lastId,
    );
    const types = harness.sent.map(({ message }) => message.type);
    const projected = types.lastIndexOf('projection');
    expect(projected).toBeLessThan(created);
    expect(lastProjection(harness).standingOrders).toEqual([
      {
        id: 'so-1',
        ...MONTHLY,
        createdAt: GAME_START,
        paused: false,
        handledUpTo: '2030-03',
        nextExecution: gameTick(2030, 4, 2, 6),
      },
    ]);

    await harness.send('setStandingOrderPaused', { standingOrderId: 'so-1', paused: true });
    expect(lastProjection(harness).standingOrders).toEqual([
      expect.objectContaining({ id: 'so-1', paused: true, nextExecution: null }),
    ]);
    await harness.send('changeStandingOrder', {
      standingOrderId: 'so-1',
      order: { ...MONTHLY, amount: 30_000, day: 3 },
    });
    expect(lastProjection(harness).standingOrders).toEqual([
      expect.objectContaining({ amount: 30_000, day: 3, paused: true }),
    ]);
    expect(
      await harness.send('setStandingOrderPaused', { standingOrderId: 'so-9', paused: false }),
    ).toMatchObject({ ok: false, error: 'unknown-standing-order' });
    expect(
      await harness.send('createStandingOrder', { order: { ...MONTHLY, day: 29 } }),
    ).toMatchObject({ ok: false, error: 'invalid-day' });
    await harness.send('deleteStandingOrder', { standingOrderId: 'so-1' });
    expect(lastProjection(harness).standingOrders).toEqual([]);
    harness.host.dispose();
  });

  // Acceptance AP 5.6a: standing orders also execute while the game catches up
  it('executes a standing order during the catch-up and keeps it over the reload', async () => {
    const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
    await first.send('loadPlayer', PLAYER);
    await first.send('openAccount', { bankId: HOME.id, kind: 'savings' });
    await first.send('createStandingOrder', { order: MONTHLY });
    await first.send('resume', {});
    await advance(first, 1_000);
    await first.send('unloadPlayer', {});

    // In real time in the background (TS §3.6): 31 hours pass 02.04.2030, 06:00.
    const second = new HostHarness(
      { config: FINE },
      { storage: new IndexedDbEngineStorage(), startMs: first.timeline.now() + 31 * HOUR_MS },
    );
    await second.send('loadPlayer', PLAYER);
    await runUntil(second, () => catchUpDone(second));
    await advance(second, 300);
    const after = lastProjection(second);
    expect(after.accounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'acc-2', balance: 25_000 })]),
    );
    const withOrders = projections(second).filter(({ standingOrders }) => standingOrders);
    expect(withOrders.at(-1)?.standingOrders).toEqual([
      expect.objectContaining({
        id: 'so-1',
        handledUpTo: '2030-04',
        nextExecution: gameTick(2030, 5, 2, 6),
      }),
    ]);
    await second.send('unloadPlayer', {});
    const journal = await new IndexedDbEngineStorage().loadTransactions(PLAYER.playerId, 'acc-2');
    expect(journal.map(({ tick, type, refs, params }) => [tick, type, refs, params])).toEqual([
      [gameTick(2030, 4, 2, 6), 'transfer', { standingOrderId: 'so-1' }, { purpose: 'Rücklage' }],
    ]);
    second.host.dispose();
  });
});
