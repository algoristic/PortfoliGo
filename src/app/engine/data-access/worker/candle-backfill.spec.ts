import { GameEngine } from '@app/engine/domain/game-engine';
import { miniGame } from '@app/engine/domain/testing/mini-game';
import { DayCurves } from '@app/market/domain/day-curve';
import { createHighLowFill } from '@app/market/domain/high-low-fill';
import { recomputeSupportDays } from '@app/market/domain/market-history';

import { CandleBackfill } from './candle-backfill';
import { DailyCandleSource } from './daily-candle-source';
import { DailyCandlePatch } from './engine-host.model';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

import { TEST_SEEDS } from '../../../../testing/seeds';
import { gameTick } from '../testing/host-harness';

const MS_PER_DAY = 86_400_000;
const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Day index of a calendar date, independent of the calendar functions (`Date.UTC`). */
function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / MS_PER_DAY;
}

/** Monday, 01.04.2030, to Friday, 05.04.2030. */
const FIRST_WEEK = [1, 2, 3, 4, 5].map((date) => day(2030, 4, date));
const MONDAY_AFTER = day(2030, 4, 8);

/** A clock that moves by `stepMs` with every reading: work costs time in proportion to it. */
function countingClock(stepMs: number): () => number {
  let nowMs = 0;
  return () => (nowMs += stepMs);
}

describe('CandleBackfill', () => {
  let source: DailyCandleSource;
  /** Reference: high and low of every series per day from `createHighLowFill`. */
  const highLow = new Map<number, { high: Float64Array; low: Float64Array }>();
  /** Reference: open and close of every series per day, the ends of the minute curves. */
  const openClose = new Map<number, { open: number[]; close: number[] }>();

  beforeAll(() => {
    const mini = miniGame(TEST_SEEDS.mini);
    source = new DailyCandleSource(mini.world);
    const engine = GameEngine.restore(mini.world, mini.start, {
      monthStarts: mini.monthStarts,
      prices: source.prices,
    });
    engine.runUntil(gameTick(2030, 4, 6));
    const { context, history, tables, ids } = source;
    createHighLowFill(context, history, FIRST_WEEK[0], MONDAY_AFTER, tables).run(
      FIRST_WEEK.length,
      ({ day: at, high, low }) => highLow.set(at, { high, low }),
    );
    const curves = new DayCurves(tables);
    recomputeSupportDays(context, history, FIRST_WEEK[0], MONDAY_AFTER, (marketDay) => {
      curves.load(marketDay);
      const ends = ids.map((_id, s) => curves.seriesCurve(s));
      openClose.set(marketDay.day, {
        open: ends.map((curve) => curve[0]),
        close: ends.map((curve) => curve[curve.length - 1]),
      });
    });
  });

  function create(): CandleBackfill {
    return new CandleBackfill(source, new InMemoryEngineStorage(), 'p1', FIRST_WEEK[0], 8);
  }

  it('adds high and low newest day first, in slices that keep their budget', () => {
    const backfill = create();
    backfill.addHighLowDays(FIRST_WEEK);
    const now = countingClock(0.05);
    const emitted: DailyCandlePatch[][] = [];
    const spent: number[] = [];
    while (backfill.hasWork(MONDAY_AFTER)) {
      spent.push(backfill.runSlice(MONDAY_AFTER, now, 2, (patches) => emitted.push(patches)));
    }

    // A series costs three readings (0.15 ms), so a slice ends at most one series late.
    expect(Math.max(...spent)).toBeLessThanOrEqual(2 + 0.2);
    expect(spent.length).toBeGreaterThan(FIRST_WEEK.length);
    expect(emitted.map(([first]) => first.day)).toEqual([...FIRST_WEEK].reverse());
    for (const patches of emitted) {
      const reference = highLow.get(patches[0].day);
      expect(patches.map(({ high }) => high)).toEqual(Array.from(reference?.high ?? []));
      expect(patches.map(({ low }) => low)).toEqual(Array.from(reference?.low ?? []));
      expect(patches.every(({ open, close }) => Number.isNaN(open) && Number.isNaN(close))).toBe(
        true,
      );
    }
    expect([backfill.done, backfill.total]).toEqual([5, 5]);
  });

  it('starts no work without budget', () => {
    const backfill = create();
    backfill.addHighLowDays(FIRST_WEEK);
    const emit = vi.fn();
    backfill.runSlice(MONDAY_AFTER, countingClock(0.05), 0, emit);
    expect(emit).not.toHaveBeenCalled();
    expect(backfill.done).toBe(0);
  });

  it('plans what the store misses and adds opens and closes before highs and lows', async () => {
    const backfill = create();
    await backfill.plan(MONDAY_AFTER);
    const emitted: DailyCandlePatch[][] = [];
    while (backfill.hasWork(MONDAY_AFTER)) {
      backfill.runSlice(MONDAY_AFTER, countingClock(0), 8, (patches) => emitted.push(patches));
    }

    const kinds = emitted.map(([first]) => (Number.isNaN(first.high) ? 'open-close' : 'high-low'));
    expect(kinds).toEqual([...Array(5).fill('open-close'), ...Array(5).fill('high-low')]);
    for (const patches of emitted.slice(0, 5)) {
      const reference = openClose.get(patches[0].day);
      expect(patches.map(({ open }) => open)).toEqual(reference?.open);
      expect(patches.map(({ close }) => close)).toEqual(reference?.close);
    }
    expect([backfill.done, backfill.total]).toEqual([10, 10]);
  });

  it('leaves days that are not closed yet', () => {
    const backfill = create();
    backfill.addHighLowDays(FIRST_WEEK);
    const emitted: number[] = [];
    while (backfill.hasWork(FIRST_WEEK[2])) {
      backfill.runSlice(FIRST_WEEK[2], countingClock(0), 8, ([first]) => emitted.push(first.day));
    }
    expect(emitted).toEqual([FIRST_WEEK[1], FIRST_WEEK[0]]);
    expect(backfill.hasWork(MONDAY_AFTER)).toBe(true);
  });
});
