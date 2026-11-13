import { AccountView } from '@app/engine/domain/models/account-view.model';
import { TaxesProjection } from '@app/engine/domain/models/taxes-view.model';
import { OrderSpec } from '@app/trading/domain/models/order.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { Exchange } from '@app/world/domain/models/taxonomy.model';

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

// The tax part of the projection (AP 5.3, TS §7.7, §8.3, §8.4) on the mini world `mini-1`: a depot
// at a bank without current accounts, funded with 5.000 € from the salary account, and the first
// share of the world. The game starts on Monday 01.04.2030 at 00:00.

const { world } = generateMiniWorld(PLAYER.seed);
const BROKER = world.banks.find(({ conditions }) => conditions.currentAccount === null) as Bank;
const SHARE = world.companies[0];
const EXCHANGE = world.exchanges.find(({ id }) => id === SHARE.exchangeId) as Exchange;
/** Monday, half an hour after the share's exchange opened. */
const OPEN = GAME_START + EXCHANGE.open + 30;
const FUNDS = 500_000;
const DEPOT = 'dep-3';
const CLEARING = 'acc-2';

const EMPTY_YEAR = {
  lossCarryForward: 0,
  income: 0,
  withheld: 0,
  interest: 0,
  distributions: 0,
  gains: 0,
  losses: 0,
  paid: 0,
  refunded: 0,
};

function market(side: OrderSpec['side']): OrderSpec {
  return {
    depotId: DEPOT,
    instrumentId: SHARE.id,
    side,
    type: 'market',
    size: { kind: 'quantity', quantity: 1_000_000 },
    limit: null,
    stop: null,
    validity: { kind: 'day' },
  };
}

/** The tax parts of the projections since message `from`. */
function taxParts(harness: HostHarness, from = 0): TaxesProjection[] {
  return harness.sent
    .slice(from)
    .flatMap(({ message }) =>
      message.type === 'projection' && message.payload.taxes !== undefined
        ? [message.payload.taxes]
        : [],
    );
}

function clearingBalance(harness: HostHarness): number {
  const views = harness
    .events('projection')
    .flatMap(({ payload }) => payload.accounts)
    .filter(({ id }) => id === CLEARING);
  return (views.at(-1) as AccountView).balance;
}

async function jumpTo(harness: HostHarness, tick: number): Promise<void> {
  await harness.send('jumpTo', { target: { kind: 'date', tick } });
  await runUntil(harness, () =>
    harness.progress.some(({ kind, state }) => kind === 'jump' && state === 'done'),
  );
  await advance(harness, 500);
}

describe('EngineHost taxes', () => {
  it('sends the tax years with the full projection and then only when they change', async () => {
    const harness = new HostHarness({ config: FINE });
    await harness.send('loadPlayer', PLAYER);
    expect(taxParts(harness)).toEqual([{ current: { year: 2030, ...EMPTY_YEAR }, closed: [] }]);

    // Opening and funding a depot books nothing taxable.
    await harness.send('openAccount', { bankId: BROKER.id, kind: 'depot' });
    await harness.send('transfer', {
      fromAccountId: 'acc-1',
      toAccountId: CLEARING,
      amount: FUNDS,
      purpose: '',
    });
    expect(taxParts(harness)).toHaveLength(1);

    // A purchase and its sale in the same paused tick realize the spread and the fees as a loss:
    // the clearing account lost exactly that. Nothing was withheld, so nothing is refunded.
    await jumpTo(harness, OPEN);
    await harness.send('pause', {});
    await harness.send('placeOrder', { order: market('buy') });
    expect(taxParts(harness)).toHaveLength(1);
    const from = harness.sent.length;
    await harness.send('placeOrder', { order: market('sell') });
    const loss = clearingBalance(harness) - FUNDS;
    expect(loss).toBeLessThan(0);
    expect(taxParts(harness, from)).toEqual([
      { current: { year: 2030, ...EMPTY_YEAR, income: loss, losses: loss }, closed: [] },
    ]);

    // The year end closes 2030 with the loss as carry-forward into 2031.
    await jumpTo(harness, gameTick(2031, 1, 1, 0, 1));
    expect(taxParts(harness).at(-1)).toEqual({
      current: { year: 2031, ...EMPTY_YEAR, lossCarryForward: loss },
      closed: [{ year: 2030, ...EMPTY_YEAR, income: loss, losses: loss }],
    });
  });

  it('sends the tax years again with the full projection after a reload', async () => {
    const harness = new HostHarness({ config: FINE });
    await harness.send('loadPlayer', PLAYER);
    await jumpTo(harness, gameTick(2031, 1, 1, 0, 1));
    const from = harness.sent.length;
    await harness.send('loadPlayer', PLAYER);
    expect(taxParts(harness, from)).toEqual([
      { current: { year: 2031, ...EMPTY_YEAR }, closed: [{ year: 2030, ...EMPTY_YEAR }] },
    ]);
  });
});
