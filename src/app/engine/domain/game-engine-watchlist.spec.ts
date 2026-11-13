import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { MAX_WATCHLIST_LENGTH } from '@app/market/domain/models/watchlist.model';

import { GameEngine } from './game-engine';
import { GameCommand, UpdateWatchlistCommand } from './models/engine-command.model';
import { replayCommands } from './replay';
import { MiniGame, miniGame } from './testing/mini-game';

// The watchlist in the player state (US-MK-04, TS §8.2): `updateWatchlist` replaces the list.

const APR_2 = dateTimeToTick({ year: 2030, month: 4, day: 2 });
const APR_3 = dateTimeToTick({ year: 2030, month: 4, day: 3 });

describe('GameEngine', () => {
  let mini: MiniGame;
  let engine: GameEngine;
  /** A share, a price index, a total return index and an ETF of the mini world. */
  let share: string;
  let index: string;
  let totalReturn: string;
  let etf: string;

  beforeAll(() => {
    mini = miniGame();
    const { world } = mini.world;
    share = world.companies[0].id;
    index = world.indices[0].id;
    totalReturn = `${world.indices[0].id}-tr`;
    etf = world.etfs[0].id;
  });

  beforeEach(() => {
    engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
  });

  /** IDs of all instruments from the world's lists (TS §8.2), not from the market layout. */
  function allInstrumentIds(): string[] {
    const { companies, indices, etfs } = mini.world.world;
    return [
      ...companies.map(({ id }) => id),
      ...indices.flatMap(({ id }) => [id, `${id}-tr`]),
      ...etfs.map(({ id }) => id),
    ];
  }

  function update(ids: string[], id = 'w1', at = engine.tick): UpdateWatchlistCommand {
    return { id, tick: at, type: 'updateWatchlist', ids };
  }

  describe('US-MK-04: watchlist', () => {
    it('starts empty', () => {
      expect(engine.player.watchlist).toEqual([]);
    });

    it('adds, reorders and removes instruments of every kind', () => {
      expect(engine.applyCommand(update([share]))).toEqual({ ok: true });
      expect(engine.player.watchlist).toEqual([share]);
      expect(engine.applyCommand(update([share, index, totalReturn, etf], 'w2'))).toEqual({
        ok: true,
      });
      expect(engine.applyCommand(update([etf, share, totalReturn, index], 'w3'))).toEqual({
        ok: true,
      });
      expect(engine.player.watchlist).toEqual([etf, share, totalReturn, index]);
      expect(engine.applyCommand(update([etf, index], 'w4'))).toEqual({ ok: true });
      expect(engine.player.watchlist).toEqual([etf, index]);
      expect(engine.applyCommand(update([], 'w5'))).toEqual({ ok: true });
      expect(engine.player.watchlist).toEqual([]);
    });

    it('rejects unknown and repeated instruments and too long lists and keeps the list', () => {
      const tooLong = allInstrumentIds().slice(0, MAX_WATCHLIST_LENGTH + 1);
      expect(tooLong).toHaveLength(MAX_WATCHLIST_LENGTH + 1);
      engine.applyCommand(update([share, etf]));
      expect(engine.applyCommand(update([share, 'nope'], 'w2'))).toEqual({
        ok: false,
        error: 'unknown-instrument',
      });
      expect(engine.applyCommand(update([share, etf, share], 'w3'))).toEqual({
        ok: false,
        error: 'duplicate-instrument',
      });
      expect(engine.applyCommand(update(tooLong, 'w4'))).toEqual({
        ok: false,
        error: 'watchlist-too-long',
      });
      expect(engine.applyCommand(update([share, 7 as never], 'w5'))).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      expect(engine.applyCommand(update('x' as never, 'w6'))).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      expect(engine.player.watchlist).toEqual([share, etf]);
    });

    it('accepts the longest list from the end of the series order', () => {
      const ids = allInstrumentIds().reverse().slice(0, MAX_WATCHLIST_LENGTH);
      expect(ids).toHaveLength(MAX_WATCHLIST_LENGTH);
      expect(engine.applyCommand(update(ids))).toEqual({ ok: true });
      expect(engine.player.watchlist).toEqual(ids);
    });

    it('keeps the watchlist in snapshots that share nothing with the engine', () => {
      const ids = [index, share];
      engine.applyCommand(update(ids));
      ids.push(etf);
      const snapshot = engine.snapshot();
      expect(snapshot.player.watchlist).toEqual([index, share]);
      engine.applyCommand(update([etf], 'w2'));
      expect(snapshot.player.watchlist).toEqual([index, share]);
      const restored = GameEngine.restore(mini.world, snapshot, { monthStarts: mini.monthStarts });
      expect(restored.player.watchlist).toEqual([index, share]);
    });

    it('replays accepted commands and leaves rejected ones without effect', () => {
      const commands: GameCommand[] = [
        update([share, etf], 'w1', APR_2),
        update([share, share], 'w2', APR_2),
        update([etf, share, totalReturn], 'w3', APR_3),
        update(['nope'], 'w4', APR_3),
      ];
      const results = replayCommands(engine, commands, APR_3);
      expect(results).toEqual([
        { ok: true },
        { ok: false, error: 'duplicate-instrument' },
        { ok: true },
        { ok: false, error: 'unknown-instrument' },
      ]);
      const restored = GameEngine.restore(mini.world, mini.start, {
        monthStarts: mini.monthStarts,
      });
      replayCommands(restored, commands, APR_3);
      expect(restored.player.watchlist).toEqual([etf, share, totalReturn]);
    });
  });
});
