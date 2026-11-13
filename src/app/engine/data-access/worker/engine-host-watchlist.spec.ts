import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { ProjectionPayload } from '../service/engine-service.model';
import { advance, FINE, HostHarness, MINI_PLAYER } from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// The watchlist through the worker host (US-MK-04, TS §8.2, §8.3, §8.5, §9.2) on the mini world.

const { world } = generateMiniWorld(MINI_PLAYER.seed);
const SHARE = world.companies[0].id;
const TOTAL_RETURN = `${world.indices[0].id}-tr`;
const ETF = world.etfs[0].id;

function projections(harness: HostHarness): ProjectionPayload[] {
  return harness.events('projection').map(({ payload }) => payload);
}

/** The watchlist part of the last projection that carried one. */
function watchlistPart(harness: HostHarness): ProjectionPayload['watchlist'] {
  return projections(harness)
    .map(({ watchlist }) => watchlist)
    .filter((part) => part !== undefined)
    .at(-1);
}

async function running(harness: HostHarness): Promise<void> {
  await harness.send('loadPlayer', MINI_PLAYER);
  await harness.send('setSpeed', { speed: '1h' });
  await harness.send('resume', {});
  await advance(harness, 2_000);
}

describe('EngineHost watchlist', () => {
  describe('US-MK-04: updateWatchlist', () => {
    it('sends an empty watchlist with the full projection of a new player', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', MINI_PLAYER);
      const [first] = projections(harness);
      expect(first).toMatchObject({ full: true, watchlist: { ids: [] } });
    });

    it('answers with the tick and sends the new list in a projection before the reply', async () => {
      const harness = new HostHarness({ config: FINE });
      await running(harness);
      const sentBefore = harness.sent.length;
      const reply = await harness.send('updateWatchlist', { ids: [ETF, SHARE, TOTAL_RETURN] });
      expect(reply).toEqual({ ok: true, data: { tick: harness.clock.tick } });
      const after = harness.sent.slice(sentBefore).map(({ message }) => message.type);
      expect(after.indexOf('projection')).toBeGreaterThanOrEqual(0);
      expect(after.indexOf('projection')).toBeLessThan(after.indexOf('reply'));
      expect(watchlistPart(harness)).toEqual({ ids: [ETF, SHARE, TOTAL_RETURN] });

      await harness.send('updateWatchlist', { ids: [TOTAL_RETURN] });
      expect(watchlistPart(harness)).toEqual({ ids: [TOTAL_RETURN] });
    });

    it('leaves the watchlist out of projections while it does not change', async () => {
      const harness = new HostHarness({ config: FINE });
      await running(harness);
      await harness.send('updateWatchlist', { ids: [SHARE] });
      const count = projections(harness).length;
      await harness.send('openAccount', { bankId: world.banks[0].id, kind: 'savings' });
      await advance(harness, 2_000);
      const later = projections(harness).slice(count);
      expect(later.length).toBeGreaterThan(0);
      expect(later.every(({ watchlist }) => watchlist === undefined)).toBe(true);
    });

    it.each([
      ['an unknown instrument', [SHARE, 'nope'], 'unknown-instrument'],
      ['an instrument twice', [SHARE, ETF, SHARE], 'duplicate-instrument'],
    ])('rejects %s with its code and keeps the list', async (_name, ids, error) => {
      const harness = new HostHarness({ config: FINE });
      await running(harness);
      await harness.send('updateWatchlist', { ids: [ETF] });
      expect(await harness.send('updateWatchlist', { ids })).toMatchObject({ ok: false, error });
      expect(watchlistPart(harness)).toEqual({ ids: [ETF] });
    });

    it('rejects a payload that is not a list of IDs', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', MINI_PLAYER);
      const reply = await harness.send('updateWatchlist', { ids: [SHARE, 3 as never] });
      expect(reply).toMatchObject({ ok: false, error: 'invalid-command' });
    });
  });

  describe('reloading (TS §9.2)', () => {
    async function reloaded(first: HostHarness): Promise<HostHarness> {
      const second = new HostHarness(
        { config: FINE },
        { storage: new IndexedDbEngineStorage(), startMs: first.timeline.now() },
      );
      await second.send('loadPlayer', { ...MINI_PLAYER, minTick: first.clock.tick });
      second.host.dispose();
      return second;
    }

    it('keeps the watchlist after a crash through the write-ahead log', async () => {
      const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
      await running(first);
      await first.send('updateWatchlist', { ids: [SHARE, ETF] });
      await first.send('updateWatchlist', { ids: [ETF, TOTAL_RETURN, SHARE] });
      // Rejected: logged, and rejected again in the replay.
      await first.send('updateWatchlist', { ids: ['nope'] });
      first.host.dispose();

      const second = await reloaded(first);
      const [full] = projections(second);
      expect(full).toMatchObject({ full: true, watchlist: { ids: [ETF, TOTAL_RETURN, SHARE] } });
    });

    it('keeps the watchlist in the snapshot after unloading', async () => {
      const first = new HostHarness({ config: FINE }, { storage: new IndexedDbEngineStorage() });
      await running(first);
      await first.send('updateWatchlist', { ids: [TOTAL_RETURN, SHARE] });
      await first.send('unloadPlayer', {});
      const { snapshot } = await first.storage.loadPlayerState(MINI_PLAYER.playerId);
      expect(snapshot?.state.player.watchlist).toEqual([TOTAL_RETURN, SHARE]);

      const second = await reloaded(first);
      expect(projections(second)[0]).toMatchObject({
        full: true,
        watchlist: { ids: [TOTAL_RETURN, SHARE] },
      });
    });
  });
});
