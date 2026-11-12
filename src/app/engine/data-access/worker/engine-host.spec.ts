import { TestMarket, TestPrice } from '@app/engine/domain/testing/test-market';

import { InMemoryEngineStorage } from './in-memory-engine-storage';

import {
  advance,
  FINE,
  flushMicrotasks,
  GAME_START,
  HostHarness,
  MINI_PLAYER as PLAYER,
  gameTick as tick,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

/** Storage whose writes wait until the test resolves or rejects them. */
class HeldStorage extends InMemoryEngineStorage {
  readonly writes: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  override appendCommand(): Promise<void> {
    return new Promise((resolve, reject) => this.writes.push({ resolve, reject }));
  }
}

function maxInAnySecond(times: readonly number[]): number {
  return Math.max(
    0,
    ...times.map((start) => times.filter((at) => at >= start && at < start + 1_000).length),
  );
}

describe('EngineHost', () => {
  describe('loadPlayer', () => {
    it('starts a new player paused at 01.04.2030 00:00 and reports the initialisation', async () => {
      const harness = new HostHarness();
      expect(await harness.send('loadPlayer', PLAYER)).toEqual({
        ok: true,
        data: { playerId: 'p1', tick: GAME_START },
      });
      expect(harness.progress).toEqual([
        { kind: 'init', state: 'running', done: 0, total: 1 },
        { kind: 'init', state: 'done', done: 1, total: 1 },
      ]);
      await advance(harness, 60_000);
      expect(harness.clock).toMatchObject({
        tick: GAME_START,
        paused: true,
        effectiveSpeed: null,
        visible: true,
        backgroundMode: 'realtime',
        jumping: false,
      });
    });

    it('answers commands that need a player with player-not-loaded', async () => {
      const harness = new HostHarness();
      expect(await harness.send('setSpeed', { speed: '1h' })).toMatchObject({
        ok: false,
        error: 'player-not-loaded',
      });
      expect(await harness.send('query', { query: { kind: 'exchanges' } })).toMatchObject({
        ok: false,
        error: 'player-not-loaded',
      });
    });
  });

  describe('clock', () => {
    // TS §3.4: ticks per second of every speed.
    it.each([
      ['realtime', 120_000, 2],
      ['1min', 1_000, 1],
      ['10min', 1_000, 10],
      ['1h', 1_000, 60],
      ['2h', 1_000, 120],
      ['4h', 1_000, 240],
      ['1d', 1_000, 1_440],
      ['1w', 1_000, 10_080],
    ] as const)('runs %s for %d ms → %d ticks after resume', async (speed, ms, ticks) => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed });
      await harness.send('resume', {});
      await advance(harness, ms);
      expect(harness.clock).toMatchObject({
        tick: GAME_START + ticks,
        speed,
        effectiveSpeed: speed,
      });
    });

    it('keeps a pause of the player, also while hidden in real-time mode', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await advance(harness, 1_000);
      await harness.send('pause', {});
      await advance(harness, 5_000);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 120_000);
      await harness.send('setVisibility', { visible: true });
      await advance(harness, 5_000);
      expect(harness.clock).toMatchObject({
        tick: GAME_START + 60,
        paused: true,
        effectiveSpeed: null,
      });
    });

    it('runs in real time while hidden and at the chosen speed when visible again', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 120_000);
      expect(harness.clock).toMatchObject({
        tick: GAME_START + 2,
        paused: false,
        visible: false,
        effectiveSpeed: 'realtime',
      });
      await harness.send('setVisibility', { visible: true });
      await advance(harness, 1_000);
      expect(harness.clock).toMatchObject({ tick: GAME_START + 62, effectiveSpeed: '1h' });
    });

    it('rests while hidden in background mode pause without pausing the player', async () => {
      const harness = new HostHarness({ config: FINE });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setBackgroundMode', { mode: 'pause' });
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 120_000);
      expect(harness.clock).toMatchObject({
        tick: GAME_START,
        paused: false,
        backgroundMode: 'pause',
        effectiveSpeed: null,
      });
      await harness.send('setVisibility', { visible: true });
      await advance(harness, 1_000);
      expect(harness.clock.tick).toBe(GAME_START + 60);
    });

    it('sends at most 10 clock events per second', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1w' });
      await harness.send('resume', {});
      await advance(harness, 3_000);
      const times = harness.events('clock').map(({ atMs }) => atMs);
      expect(times.length).toBeGreaterThanOrEqual(25);
      expect(maxInAnySecond(times)).toBeLessThanOrEqual(10);
    });

    it('reports overloaded when the passes fall behind and never skips the backlog', async () => {
      // Without a budget a pass ends after the first tick with tasks: 100 passes for ten weeks.
      const harness = new HostHarness({ config: { passBudgetMs: 0, loopIntervalMs: 100 } });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1w' });
      await harness.send('resume', {});
      await advance(harness, 10_000);
      expect(harness.clock.overloaded).toBe(true);
      expect(harness.clock.tick).toBeLessThan(GAME_START + 10 * 10_080);
    });
  });

  describe('quotes', () => {
    function market(): TestMarket {
      const prices: TestPrice[][] = [];
      prices[0] = [
        { tick: tick(2030, 3, 1), price: 100 },
        { tick: GAME_START + 30, price: 110 },
      ];
      prices[1] = [{ tick: tick(2030, 3, 1), price: 50 }];
      return new TestMarket(prices);
    }

    it('sends quotes of the subscribed series only up to the current tick', async () => {
      const harness = new HostHarness({ prices: () => market(), config: FINE });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('subscribe', { series: [0] });
      expect(harness.quotes.tick).toBe(GAME_START);
      expect(harness.quotes.quotes.map((quote) => [quote.series, quote.last])).toEqual([[0, 100]]);
      await harness.send('setSpeed', { speed: '1min' });
      await harness.send('resume', {});
      await advance(harness, 29_000);
      expect(harness.quotes).toMatchObject({ tick: GAME_START + 29, quotes: [{ last: 100 }] });
      await advance(harness, 1_000);
      expect(harness.quotes).toMatchObject({
        tick: GAME_START + 30,
        quotes: [{ series: 0, last: 110, previousClose: 100, change: 10 }],
      });
    });

    it('stops quotes of unsubscribed series', async () => {
      const harness = new HostHarness({ prices: () => market(), config: FINE });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('subscribe', { series: [0, 1] });
      await harness.send('unsubscribe', { series: [0] });
      await harness.send('setSpeed', { speed: '1min' });
      await harness.send('resume', {});
      await advance(harness, 2_000);
      expect(harness.quotes.quotes.map((quote) => quote.series)).toEqual([1]);
    });

    it('sends at most 4 quote events per second', async () => {
      const harness = new HostHarness({ prices: () => market() });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('subscribe', { series: [1] });
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await advance(harness, 3_000);
      const times = harness.events('quotes').map(({ atMs }) => atMs);
      expect(times.length).toBeGreaterThanOrEqual(10);
      expect(maxInAnySecond(times)).toBeLessThanOrEqual(4);
    });
  });

  describe('game commands', () => {
    it('applies a command at the current tick after writing it ahead', async () => {
      const storage = new InMemoryEngineStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await advance(harness, 1_000);
      expect(await harness.send('setBackgroundMode', { mode: 'pause' })).toEqual({
        ok: true,
        data: { tick: GAME_START + 60 },
      });
      expect(storage.commands).toEqual([
        {
          playerId: 'p1',
          command: { id: 't4', tick: GAME_START + 60, type: 'setBackgroundMode', mode: 'pause' },
          clock: expect.objectContaining({ tick: GAME_START + 60, speed: '1h', paused: false }),
        },
      ]);
      await advance(harness, 10);
      expect(harness.clock.backgroundMode).toBe('pause');
    });

    it('holds the clock while the command is written and goes on from a new anchor', async () => {
      const storage = new HeldStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      const answered = harness.host.receive({
        protocol: 1,
        id: 'cmd',
        type: 'setBackgroundMode',
        payload: { mode: 'pause' },
      });
      await flushMicrotasks();
      await advance(harness, 2_000);
      expect(harness.clock.tick).toBe(GAME_START);
      storage.writes[0].resolve();
      await answered;
      expect(harness.replyTo('cmd')).toEqual({ ok: true, data: { tick: GAME_START } });
      await advance(harness, 1_000);
      expect(harness.clock.tick).toBe(GAME_START + 60);
    });

    it('does not apply a command whose write failed', async () => {
      const storage = new HeldStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      const answered = harness.host.receive({
        protocol: 1,
        id: 'cmd',
        type: 'setBackgroundMode',
        payload: { mode: 'pause' },
      });
      await flushMicrotasks();
      storage.writes[0].reject(new Error('quota'));
      await answered;
      expect(harness.replyTo('cmd')).toEqual({
        ok: false,
        error: 'storage-failed',
        message: 'quota',
      });
      await advance(harness, 100);
      expect(harness.clock.backgroundMode).toBe('realtime');
    });
  });

  describe('jumps', () => {
    it('jumps to the next month start in batch mode and stays paused', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      expect(await harness.send('jumpTo', { target: { kind: 'next-month' } })).toEqual({
        ok: true,
        data: { targetTick: tick(2030, 5, 1) },
      });
      await advance(harness, 0);
      const total = tick(2030, 5, 1) - GAME_START;
      expect(harness.progress.filter(({ kind }) => kind === 'jump')).toEqual([
        { kind: 'jump', state: 'running', done: 0, total },
        { kind: 'jump', state: 'done', done: total, total },
      ]);
      await advance(harness, 1_000);
      expect(harness.clock).toMatchObject({ tick: tick(2030, 5, 1), paused: true, jumping: false });
    });

    it('rejects commands while jumping and stops after the running tick when cancelled', async () => {
      const harness = new HostHarness({ config: { passBudgetMs: 0 } });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('jumpTo', { target: { kind: 'next-month' } });
      harness.timeline.step();
      harness.timeline.step();
      expect(await harness.send('setSpeed', { speed: '1h' })).toMatchObject({
        ok: false,
        error: 'busy',
      });
      expect(await harness.send('setBackgroundMode', { mode: 'pause' })).toMatchObject({
        ok: false,
        error: 'busy',
      });
      expect(await harness.send('cancelJump', {})).toEqual({ ok: true, data: null });
      const [cancelled] = harness.progress.filter(({ state }) => state === 'cancelled');
      expect(cancelled.done).toBeGreaterThan(0);
      expect(cancelled.done).toBeLessThan(cancelled.total);
      await advance(harness, 1_000);
      expect(harness.clock).toMatchObject({ tick: GAME_START + cancelled.done, jumping: false });
    });

    it('rejects a date more than a year ahead', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      expect(
        await harness.send('jumpTo', { target: { kind: 'date', tick: tick(2031, 4, 1) + 1 } }),
      ).toMatchObject({ ok: false, error: 'invalid-jump-target' });
    });
  });

  describe('messages', () => {
    it('answers an invalid payload with invalid-command and an unknown type with invalid-message', async () => {
      const harness = new HostHarness();
      await harness.host.receive({
        protocol: 1,
        id: 'a',
        type: 'setSpeed',
        payload: { speed: 'warp' },
      });
      await harness.host.receive({ protocol: 1, id: 'b', type: 'renamePlayer', payload: {} });
      await harness.host.receive({ nonsense: true });
      expect(harness.replyTo('a')).toMatchObject({ ok: false, error: 'invalid-command' });
      expect(harness.replyTo('b')).toMatchObject({ ok: false, error: 'invalid-message' });
      expect(harness.sent).toHaveLength(2);
    });

    it('lists the exchanges with region and trading hours', async () => {
      const harness = new HostHarness();
      await harness.send('loadPlayer', PLAYER);
      const reply = await harness.send('query', { query: { kind: 'exchanges' } });
      const { world } = generateMiniWorld('mini-1');
      expect(reply).toEqual({
        ok: true,
        data: {
          kind: 'exchanges',
          exchanges: world.exchanges.map(({ id, name, open, close, countryId }) => ({
            id,
            name,
            open,
            close,
            regionId: world.countries.find((country) => country.id === countryId)?.regionId,
          })),
        },
      });
    });
  });
});
