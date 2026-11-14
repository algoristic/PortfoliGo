import { createGameWorld } from '@app/engine/domain/game-world';
import { Candle } from '@app/market/domain/models/candle.model';
import { seriesIds } from '@app/market/domain/series';

import { CandleConsolidationResult, DailyCandlePatch } from './engine-host.model';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { CandlesQuery, EngineQueryResult } from '../service/engine-service.model';
import {
  FINE,
  GAME_START,
  gameTick,
  HostHarness,
  MINI_PLAYER,
  runUntil,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Consolidation of old daily candles to weekly ones through the worker host (TS §6.8), on the mini
// world with IndexedDB. Five years of daily candles instead of 20, so that at the game start in
// April 2030 the years up to 2024 are due. The stored daily candles are made up; the oracle groups
// them by week with `Date`.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1_440;
const { seedKey, world } = generateMiniWorld(MINI_PLAYER.seed);
const ids = seriesIds(createGameWorld(seedKey, world).context);

type CandlesResult = Extract<EngineQueryResult, { kind: 'candles' }>;

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / DAY_MS;
}

function weekdayOf(at: number): number {
  return new Date(EPOCH_MS + at * DAY_MS).getUTCDay();
}

/** Weekdays of a year, by `Date`. */
function marketDays(year: number): number[] {
  const days: number[] = [];
  for (let at = day(year, 1, 1); at < day(year + 1, 1, 1); at++) {
    if (weekdayOf(at) !== 0 && weekdayOf(at) !== 6) {
      days.push(at);
    }
  }
  return days;
}

/** A made-up daily candle of a series, in quarters (exact in float32). */
function made(series: number, at: number): Candle {
  const base = 50 + series + ((at * 13) % 41) / 4;
  return {
    tick: at * MINUTES_PER_DAY,
    open: base,
    high: base + 1 + (at % 3) / 4,
    low: base - 1 - (at % 5) / 4,
    close: base + ((at % 7) - 3) / 4,
  };
}

/** Brute-force reference: candles grouped by `key`, open first, high max, low min, close last. */
function grouped(daily: readonly Candle[], key: (at: number) => number): Candle[] {
  const groups = new Map<number, Candle[]>();
  for (const candle of daily) {
    const id = key(candle.tick / MINUTES_PER_DAY);
    groups.set(id, [...(groups.get(id) ?? []), candle]);
  }
  return [...groups.entries()].map(([id, items]) => ({
    tick: id * MINUTES_PER_DAY,
    open: items[0].open,
    high: Math.max(...items.map(({ high }) => high)),
    low: Math.min(...items.map(({ low }) => low)),
    close: items[items.length - 1].close,
  }));
}

function monday(at: number): number {
  return at - ((weekdayOf(at) + 6) % 7);
}

/** Records what each consolidation answered. */
class RecordingStorage extends IndexedDbEngineStorage {
  readonly consolidations: Array<[number, CandleConsolidationResult]> = [];

  override async consolidateCandles(
    ...args: Parameters<IndexedDbEngineStorage['consolidateCandles']>
  ): Promise<CandleConsolidationResult> {
    const result = await super.consolidateCandles(...args);
    this.consolidations.push([args[2], result]);
    return result;
  }
}

async function candles(
  harness: HostHarness,
  request: Omit<CandlesQuery, 'kind'>,
): Promise<CandlesResult> {
  const reply = await harness.send('query', { query: { kind: 'candles', ...request } });
  if (!reply.ok) {
    throw new Error(`query failed: ${reply.error}`);
  }
  return reply.data as CandlesResult;
}

describe('EngineHost candle consolidation', () => {
  it('consolidates complete old years to weekly candles and answers queries from them', async () => {
    const storage = new RecordingStorage();
    const patches: DailyCandlePatch[] = [];
    for (const year of [2020, 2021, 2022]) {
      for (const at of marketDays(year)) {
        ids.forEach((seriesId, series) => {
          const { open, high, low, close } = made(series, at);
          patches.push({ seriesId, day: at, open, high, low, close });
        });
      }
    }
    // 2022 misses one high of the last series: it stays daily.
    const gap = patches.filter(({ day: at }) => at === day(2022, 6, 1)).at(-1);
    if (gap !== undefined) {
      gap.high = Number.NaN;
    }
    await storage.saveDailyCandles(MINI_PLAYER.playerId, patches);

    const harness = new HostHarness(
      { config: { ...FINE, dailyCandleYears: 5 }, candleBackfillFrom: GAME_START },
      { storage },
    );
    await harness.send('loadPlayer', MINI_PLAYER);
    await runUntil(harness, () => storage.consolidations.length === 5);

    expect(storage.consolidations).toEqual([
      [2020, 'consolidated'],
      [2021, 'consolidated'],
      [2022, 'incomplete'],
      [2023, 'none'],
      [2024, 'none'],
    ]);
    for (const seriesId of ids) {
      const daily = await storage.loadDailyCandles(MINI_PLAYER.playerId, seriesId, 2020, 2024);
      const weekly = await storage.loadWeeklyCandles(MINI_PLAYER.playerId, seriesId, 2020, 2024);
      expect(daily.map(({ year }) => year)).toEqual([2022]);
      expect(weekly.map(({ year }) => year)).toEqual([2020, 2021]);
    }

    // Weekly candles from the epoch to the end of 2022: the week across 2021/2022 merges a weekly
    // part of 2021 with daily candles of 2022.
    const series = 0;
    const daily = [2020, 2021, 2022].flatMap((year) =>
      marketDays(year).map((at) => made(series, at)),
    );
    const weekly = await candles(harness, {
      series,
      interval: '1w',
      to: gameTick(2022, 12, 31),
    });
    expect(weekly.candles).toEqual(grouped(daily, monday));
    expect(weekly.hasOlder).toBe(false);

    // Daily candles over the turn of 2021/2022: one part per week of 2021 at its first day.
    const turn = await candles(harness, {
      series,
      interval: '1d',
      from: gameTick(2021, 12, 20),
      to: gameTick(2022, 1, 5),
    });
    const december = marketDays(2021)
      .filter((at) => at >= day(2021, 12, 20))
      .map((at) => made(series, at));
    expect(turn.candles).toEqual([
      ...grouped(december, monday).map((part, index) => ({
        ...part,
        tick: [day(2021, 12, 20), day(2021, 12, 27)][index] * MINUTES_PER_DAY,
      })),
      made(series, day(2022, 1, 3)),
      made(series, day(2022, 1, 4)),
      made(series, day(2022, 1, 5)),
    ]);

    // Reloaded, the job tries nothing again that is consolidated.
    await harness.send('unloadPlayer', {});
    const reloaded = new HostHarness(
      { config: { ...FINE, dailyCandleYears: 5 }, candleBackfillFrom: GAME_START },
      { storage, startMs: harness.timeline.now() },
    );
    await reloaded.send('loadPlayer', MINI_PLAYER);
    await runUntil(reloaded, () => storage.consolidations.length === 8);
    expect(storage.consolidations.slice(5)).toEqual([
      [2022, 'incomplete'],
      [2023, 'none'],
      [2024, 'none'],
    ]);
    await reloaded.send('unloadPlayer', {});
  });
});
