import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { advanceMarket, createMarketState } from '@app/market/domain/market-step';
import { miniMarket } from '@app/market/domain/testing/mini-market';
import { PlayerExport } from '@app/players/domain/models/player-export.model';
import { decodePlayerExport } from '@app/players/domain/player-export-logic';
import { Bank } from '@app/world/domain/models/bank.model';

import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { ExportedPlayer } from '../service/engine-service.model';
import {
  advance,
  FINE,
  gameTick,
  HostHarness,
  MINI_PLAYER as PLAYER,
  runUntil,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Export through the worker host (AP 6.1, TS §10.1, §10.2) on the mini world `mini-1`: a depot at a
// broker, a market purchase of the first share, exported on Wednesday 15.05.2030 at 14:37 while
// the exchanges trade.

const { world } = generateMiniWorld(PLAYER.seed);
const BROKER = world.banks.find(({ conditions }) => conditions.currentAccount === null) as Bank;
const SHARE = world.companies[0];
const EXPORT_TICK = gameTick(2030, 5, 15, 14, 37);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Reference: canonical JSON by sorting the keys at every level (TS §10.1). */
function referenceCanonical(value: Json): string {
  if (Array.isArray(value)) {
    return `[${value.map(referenceCanonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${referenceCanonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Reference: the JSON of an export file, read with `atob` and `DecompressionStream`. */
async function readFile(text: string): Promise<{ [key: string]: Json }> {
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const stream = new ReadableStream({
    start(controller): void {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('gzip'));
  let json = '';
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    json += decoder.decode(chunk, { stream: true });
  }
  return JSON.parse(json + decoder.decode()) as { [key: string]: Json };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function exported(harness: HostHarness, name: string): Promise<ExportedPlayer> {
  const reply = await harness.send('exportPlayer', { name });
  if (!reply.ok) {
    throw new Error(`export failed: ${reply.error}`);
  }
  return reply.data as ExportedPlayer;
}

async function decoded(file: ExportedPlayer): Promise<PlayerExport> {
  const result = await decodePlayerExport(file.content);
  if (!result.ok) {
    throw new Error(`export not readable: ${result.error}`);
  }
  return result.export;
}

/** Loads the player, opens a depot, funds it and buys one share at the market. */
async function withPurchase(harness: HostHarness): Promise<void> {
  await harness.send('loadPlayer', PLAYER);
  await harness.send('openAccount', { bankId: BROKER.id, kind: 'depot' });
  await harness.send('transfer', {
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: 500_000,
    purpose: 'Depot',
  });
  await harness.send('placeOrder', {
    order: {
      depotId: 'dep-3',
      instrumentId: SHARE.id,
      side: 'buy',
      type: 'market',
      size: { kind: 'quantity', quantity: 1_000_000 },
      limit: null,
      stop: null,
      validity: { kind: 'day' },
    },
  });
}

async function jumpTo(harness: HostHarness, tick: number): Promise<void> {
  await harness.send('jumpTo', { target: { kind: 'date', tick } });
  await runUntil(harness, () =>
    harness.progress.some(({ kind, state }) => kind === 'jump' && state === 'done'),
  );
  await advance(harness, 500);
}

describe('EngineHost export', () => {
  it('exports the state, the market at the start of the day and the journal', async () => {
    const storage = new IndexedDbEngineStorage();
    const harness = new HostHarness({ config: FINE, appVersion: '1.2.3' }, { storage });
    await withPurchase(harness);
    await jumpTo(harness, EXPORT_TICK);
    await harness.send('setSpeed', { speed: '1h' });
    const file = await exported(harness, 'Mein Depot');
    expect(file).toMatchObject({
      fileName: 'Mein-Depot-2030-05-15.pgo',
      tick: EXPORT_TICK,
      exportedAt: new Date(harness.timeline.now()).toISOString(),
    });

    // The checksum, recomputed with Web Crypto over the canonical JSON without it.
    const { checksum, ...json } = await readFile(file.content);
    expect(checksum).toBe(`sha256:${await sha256(referenceCanonical(json))}`);

    // No support points of the running day: the market of an uninterrupted run at 00:00.
    const content = await decoded(file);
    const day = Math.floor(EXPORT_TICK / TICKS_PER_DAY);
    const { context } = miniMarket(PLAYER.seed);
    const reference = createMarketState(context);
    advanceMarket(context, reference, day);
    expect(content.market.day).toBe(day);
    expect(content.marketChecksum).toBe(marketChecksum(reference));
    expect(marketChecksum(content.market)).toBe(marketChecksum(reference));
    expect(content).toMatchObject({
      appVersion: '1.2.3',
      player: { name: 'Mein Depot', seed: PLAYER.seed, startConditions: PLAYER.start },
      clock: { tick: EXPORT_TICK, speed: '1h', paused: true },
    });

    // The state and the journal are what the stored snapshot and stores hold after unloading.
    await harness.send('unloadPlayer', {});
    const stored = await storage.loadPlayerState(PLAYER.playerId);
    const snapshot = stored.snapshot?.state;
    expect(snapshot?.tick).toBe(EXPORT_TICK);
    expect(content.state).toEqual({
      tick: snapshot?.tick,
      player: snapshot?.player,
      scheduler: snapshot?.scheduler,
      commandIds: snapshot?.commandIds,
    });
    expect(content.state.player.positions).toHaveLength(1);
    expect(content.transactions).toEqual(await storage.loadTransactions(PLAYER.playerId));
    expect(content.notifications).toEqual(await storage.loadNotifications(PLAYER.playerId));
    expect(content.series.performance).toEqual(
      await storage.loadDailyPoints(PLAYER.playerId, 0, day),
    );
    expect(content.series.performance.at(-1)?.day).toBe(day - 1);
  });

  it('takes the records not yet stored', async () => {
    const harness = new HostHarness();
    await withPurchase(harness);
    const content = await decoded(await exported(harness, 'Neu'));
    expect(content.transactions.map(({ type }) => type)).toEqual(['opening-balance', 'transfer']);
    expect(await harness.storage.loadTransactions(PLAYER.playerId)).toHaveLength(1);
    harness.host.dispose();
  });

  it('answers player-not-loaded without a player and invalid-command without a name', async () => {
    const harness = new HostHarness();
    expect(await harness.send('exportPlayer', { name: 'x' })).toMatchObject({
      ok: false,
      error: 'player-not-loaded',
    });
    await harness.send('loadPlayer', PLAYER);
    expect(await harness.send('exportPlayer', {} as { name: string })).toMatchObject({
      ok: false,
      error: 'invalid-command',
    });
    harness.host.dispose();
  });
});
