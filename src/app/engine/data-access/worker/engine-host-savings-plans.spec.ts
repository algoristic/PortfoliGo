import { MINUTES_PER_HOUR } from '@app/clock/domain/models/time.model';
import { SavingsPlanSpec } from '@app/trading/domain/models/savings-plan.model';
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

// Savings plans through the worker host (AP 5.6b, TS §7.8, §8.2–§8.5): commands written ahead, the
// projection of all savings plans with their next execution, and the execution during the catch-up
// after an absence (TS §3.7).

const { world } = generateMiniWorld(PLAYER.seed);
const HOME = world.banks.find(({ type }) => type === 'branch') as Bank;
const ETF = world.etfs[0];
const EXCHANGE = world.exchanges.find(({ id }) => id === ETF.exchangeId);
const HOUR_MS = 3_600_000;

/** Tuesday, 02.04.2030, at the open of the ETF's exchange. */
const MONTHLY: SavingsPlanSpec = {
  depotId: 'dep-3',
  instrumentId: ETF.id,
  amount: 10_000,
  day: 2,
};

function openTick(year: number, month: number, day: number): number {
  const open = EXCHANGE?.open ?? 0;
  return gameTick(year, month, day, Math.floor(open / MINUTES_PER_HOUR), open % MINUTES_PER_HOUR);
}

function projections(harness: HostHarness): ProjectionPayload[] {
  return harness.events('projection').map(({ payload }) => payload);
}

function lastProjection(harness: HostHarness): ProjectionPayload {
  return projections(harness).at(-1) as ProjectionPayload;
}

function catchUpDone(harness: HostHarness): boolean {
  return harness.progress.some(({ kind, state }) => kind === 'catch-up' && state === 'done');
}

/** A depot `dep-3` with the clearing account `acc-2` at the home bank, funded with 500 €. */
async function openFundedDepot(harness: HostHarness): Promise<void> {
  await harness.send('openAccount', { bankId: HOME.id, kind: 'depot' });
  await harness.send('transfer', {
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: 50_000,
    purpose: '',
  });
}

describe('EngineHost savings plans', () => {
  it('projects the savings plans after loading and after each command, before its reply', async () => {
    expect(EXCHANGE).toBeDefined();
    const harness = new HostHarness();
    await harness.send('loadPlayer', PLAYER);
    expect(lastProjection(harness)).toMatchObject({ full: true, savingsPlans: [] });
    await openFundedDepot(harness);
    expect(lastProjection(harness).savingsPlans).toBeUndefined();

    expect(await harness.send('createSavingsPlan', { plan: MONTHLY })).toEqual({
      ok: true,
      data: { tick: GAME_START, savingsPlanId: 'sp-1' },
    });
    const created = harness.sent.findIndex(
      ({ message }) => message.type === 'reply' && message.replyTo === harness.lastId,
    );
    const types = harness.sent.map(({ message }) => message.type);
    expect(types.lastIndexOf('projection')).toBeLessThan(created);
    expect(lastProjection(harness).savingsPlans).toEqual([
      {
        id: 'sp-1',
        ...MONTHLY,
        createdAt: GAME_START,
        paused: false,
        handledUpTo: '2030-03',
        nextExecution: openTick(2030, 4, 2),
      },
    ]);

    await harness.send('setSavingsPlanPaused', { savingsPlanId: 'sp-1', paused: true });
    expect(lastProjection(harness).savingsPlans).toEqual([
      expect.objectContaining({ id: 'sp-1', paused: true, nextExecution: null }),
    ]);
    await harness.send('changeSavingsPlan', {
      savingsPlanId: 'sp-1',
      change: { amount: 20_000, day: 3 },
    });
    expect(lastProjection(harness).savingsPlans).toEqual([
      expect.objectContaining({ amount: 20_000, day: 3, paused: true }),
    ]);
    expect(
      await harness.send('setSavingsPlanPaused', { savingsPlanId: 'sp-9', paused: false }),
    ).toMatchObject({ ok: false, error: 'unknown-savings-plan' });
    expect(
      await harness.send('createSavingsPlan', { plan: { ...MONTHLY, day: 29 } }),
    ).toMatchObject({ ok: false, error: 'invalid-day' });
    expect(
      await harness.send('createSavingsPlan', {
        plan: { ...MONTHLY, instrumentId: world.indices[0].id },
      }),
    ).toMatchObject({ ok: false, error: 'not-savings-plan-eligible' });
    await harness.send('deleteSavingsPlan', { savingsPlanId: 'sp-1' });
    expect(lastProjection(harness).savingsPlans).toEqual([]);
    harness.host.dispose();
  });

  // Acceptance AP 5.6b: savings plans also execute while the game catches up
  it('executes a savings plan during the catch-up and keeps it over the reload', async () => {
    const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
    await first.send('loadPlayer', PLAYER);
    await openFundedDepot(first);
    await first.send('createSavingsPlan', { plan: MONTHLY });
    await first.send('resume', {});
    await advance(first, 1_000);
    await first.send('unloadPlayer', {});

    // In real time in the background (TS §3.6): 40 hours pass the open on 02.04.2030.
    const second = new HostHarness(
      { config: FINE },
      { storage: new IndexedDbEngineStorage(), startMs: first.timeline.now() + 40 * HOUR_MS },
    );
    await second.send('loadPlayer', PLAYER);
    await runUntil(second, () => catchUpDone(second));
    await advance(second, 300);
    const withPlans = projections(second).filter(({ savingsPlans }) => savingsPlans);
    expect(withPlans.at(-1)?.savingsPlans).toEqual([
      expect.objectContaining({
        id: 'sp-1',
        handledUpTo: '2030-04',
        nextExecution: openTick(2030, 5, 2),
      }),
    ]);
    const holdings = withPlans.at(-1)?.trading?.depots ?? lastProjection(second).trading?.depots;
    expect(holdings?.find(({ depotId }) => depotId === 'dep-3')?.positions).toEqual([
      expect.objectContaining({ instrumentId: ETF.id }),
    ]);
    await second.send('unloadPlayer', {});
    const journal = await new IndexedDbEngineStorage().loadTransactions(PLAYER.playerId, 'acc-2');
    const purchase = journal.filter(({ refs }) => refs?.['savingsPlanId'] === 'sp-1');
    expect(purchase.map(({ tick, type }) => [tick, type])).toEqual([[openTick(2030, 4, 2), 'buy']]);
    // Debit = market value + costs ≤ amount (TS §7.8).
    const debit = -(purchase[0].postings.find(({ account }) => account === 'acc-2')?.amount ?? 0);
    expect(debit).toBeGreaterThan(0);
    expect(debit).toBeLessThanOrEqual(MONTHLY.amount);
    second.host.dispose();
  });
});
