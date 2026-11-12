import fc from 'fast-check';

import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  minuteOfDay,
} from '@app/clock/domain/calendar-logic';

import { Checksum } from '@app/simulation/util/checksum';

import { World } from '@app/world/domain/models/world.model';

import { createCurveTables, CurveTables, DayCurves, SupportValues } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { createMarketContext, MarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { restoreMarket, snapshotMarket } from './market-snapshot';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { CANDLE_RESOLUTIONS, CandleResolution } from './models/candle.model';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';
import { PriceSource } from './price-source';
import { seriesCount } from './series';
import { miniMarket, MiniMarket } from './testing/mini-market';

import { arbSplitPoints } from '../../../testing/arbitraries';
import { TEST_SEEDS } from '../../../testing/seeds';

// Determinism contract of the market (TS §4.5, §4.6) as properties on the mini world: arbitrary
// splits, snapshots, query histories and instruments must never change prices.

/** The properties run the first half of 2020 (TS §4.6 checks the full year on the golden seed). */
const END_DAY = dayIndex(dateTimeToTick({ year: 2020, month: 7, day: 1 }));
/** Days that the live price source remembers, as the engine would. */
const REMEMBERED_DAYS = 8;
/** Longest span of a random candle query, so a query stays cheap. */
const MAX_QUERY_DAYS = 10;

interface Run {
  state: MarketState;
  /** Checksum over the support points of every stepped day. */
  days: string;
}

function hashDay(checksum: Checksum, day: Readonly<MarketDay>): void {
  checksum
    .addUint32(day.day)
    .addFloat64Array(day.factorLevels)
    .addFloat64Array(day.logOpen)
    .addFloat64Array(day.logClose)
    .addFloat64Array(day.idioClose)
    .addFloat64Array(day.indexReinvest);
}

/** Runs from the epoch to `END_DAY`, stopping at every split point. */
function runWithSplits(context: MarketContext, points: readonly number[]): Run {
  const state = createMarketState(context);
  const checksum = new Checksum();
  for (const point of [...points, END_DAY]) {
    advanceMarket(context, state, point, { onDay: (day) => hashDay(checksum, day) });
  }
  return { state, days: checksum.digest() };
}

type Query =
  | { kind: 'price' | 'indicative'; series: number; tick: number }
  | { kind: 'curve'; series: number; day: number }
  | { kind: 'candles'; series: number; resolution: CandleResolution; from: number; to: number };

function execute(source: PriceSource, query: Query, now: number): unknown {
  switch (query.kind) {
    case 'price':
      return source.priceAt(query.series, query.tick, now);
    case 'indicative':
      return source.indicativeAt(query.series, query.tick, now);
    case 'curve':
      return source.minuteCurve(query.series, query.day, now);
    case 'candles':
      return source.candles(query.series, query.resolution, query.from, query.to, now);
  }
}

describe('market properties', () => {
  let mini: MiniMarket;
  let context: MarketContext;
  let tables: CurveTables;
  let history: FactorHistory;
  let state: MarketState;
  let live: PriceSource;
  let liveDays: number[];
  let days: Map<number, MarketDay>;
  let whole: Run;
  /** Last tick of the last stepped day: the latest `now` of the queries. */
  let lastTick: number;

  const arbSeries = (): fc.Arbitrary<number> =>
    fc.integer({ min: 0, max: seriesCount(context) - 1 });
  const arbTickUpTo = (now: number): fc.Arbitrary<number> => fc.integer({ min: 0, max: now });
  const arbQuery = (now: number): fc.Arbitrary<Query> =>
    fc.oneof(
      fc.record({
        kind: fc.constantFrom('price' as const, 'indicative' as const),
        series: arbSeries(),
        tick: arbTickUpTo(now),
      }),
      fc.record({
        kind: fc.constant('curve' as const),
        series: arbSeries(),
        day: fc.integer({ min: 0, max: dayIndex(now) }),
      }),
      fc
        .record({
          series: arbSeries(),
          resolution: fc.constantFrom(...CANDLE_RESOLUTIONS),
          from: arbTickUpTo(now),
          span: fc.integer({ min: 0, max: MAX_QUERY_DAYS * dayStartTick(1) }),
        })
        .map(({ series, resolution, from, span }) => ({
          kind: 'candles' as const,
          series,
          resolution,
          from,
          to: from + span,
        })),
    );

  beforeAll(() => {
    mini = miniMarket(TEST_SEEDS.mini);
    context = mini.context;
    tables = createCurveTables(context);
    history = createFactorHistory();
    state = createMarketState(context);
    live = new PriceSource(context, history, state);
    liveDays = [];
    days = new Map();
    const checksum = new Checksum();
    advanceMarket(context, state, END_DAY, {
      history,
      onDay: (day) => {
        hashDay(checksum, day);
        days.set(day.day, copyMarketDay(day));
        if (day.day >= END_DAY - REMEMBERED_DAYS) {
          live.rememberDay(day);
          liveDays.push(day.day);
        }
      },
    });
    whole = { state, days: checksum.digest() };
    lastTick = dayStartTick(END_DAY) - 1;
  });

  it('gives the same prices however the days are split into calls', () => {
    fc.assert(
      fc.property(arbSplitPoints(END_DAY), (points) => {
        const split = runWithSplits(context, points);
        expect(split.days).toBe(whole.days);
        expect(marketChecksum(split.state)).toBe(marketChecksum(whole.state));
      }),
      { numRuns: 20 },
    );
  });

  it('continues identically after a snapshot and restore on any day', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: END_DAY - 1 }), (snapshotDay) => {
        const original = createMarketState(context);
        advanceMarket(context, original, snapshotDay);
        const snapshot = snapshotMarket(original);
        const snapshotChecksum = marketChecksum(snapshot);
        advanceMarket(context, original, END_DAY);
        const restored = restoreMarket(snapshot);
        advanceMarket(context, restored, END_DAY);
        expect(marketChecksum(restored)).toBe(marketChecksum(whole.state));
        expect(marketChecksum(original)).toBe(marketChecksum(whole.state));
        expect(marketChecksum(snapshot)).toBe(snapshotChecksum);
      }),
      { numRuns: 15 },
    );
  });

  it('answers a query independently of earlier queries and of the cache size', () => {
    const before = marketChecksum(state);
    fc.assert(
      fc.property(
        fc.array(arbQuery(lastTick), { maxLength: 10 }),
        arbQuery(lastTick),
        fc.integer({ min: 1, max: 4 }),
        (earlier, query, cachedDays) => {
          const probed = new PriceSource(context, history, state, { cachedDays });
          for (const previous of earlier) {
            execute(probed, previous, lastTick);
          }
          const fresh = new PriceSource(context, history, state);
          expect(execute(probed, query, lastTick)).toEqual(execute(fresh, query, lastTick));
          expect(execute(live, query, lastTick)).toEqual(execute(fresh, query, lastTick));
        },
      ),
      { numRuns: 25 },
    );
    expect(marketChecksum(state)).toBe(before);
  });

  it('never returns values after now and rejects later ticks', () => {
    fc.assert(
      fc.property(
        arbTickUpTo(lastTick).chain((now) => fc.tuple(fc.constant(now), arbQuery(lastTick))),
        fc.integer({ min: 1, max: dayStartTick(2) }),
        ([now, query], ahead) => {
          const source = new PriceSource(context, history, state);
          const nowDay = dayIndex(now);
          expect(() => source.priceAt(query.series, now + ahead, now)).toThrow(RangeError);
          expect(() => source.indicativeAt(query.series, now + ahead, now)).toThrow(RangeError);
          // Days without trading have no curve at all; the next trading day must be rejected.
          let nextMarketDay = nowDay + 1;
          while (!isMarketDay(nextMarketDay)) {
            nextMarketDay++;
          }
          expect(() => source.minuteCurve(query.series, nextMarketDay, now)).toThrow(RangeError);

          const curve = source.minuteCurve(query.series, nowDay, now);
          const candles = source.candles(
            query.series,
            '1m',
            dayStartTick(nowDay),
            now + ahead,
            now,
          );
          expect(candles.every((candle) => candle.tick <= now)).toBe(true);
          if (curve.length > 0) {
            // The curve starts at the open, so its last minute is at most `now`.
            expect(curve.length).toBeLessThanOrEqual(minuteOfDay(now) + 1);
            expect(curve[curve.length - 1]).toBe(source.priceAt(query.series, now, now));
            const [daily] = source.candles(query.series, '1d', dayStartTick(nowDay), now, now);
            expect(daily.high).toBe(Math.max(...curve));
            expect(daily.low).toBe(Math.min(...curve));
            expect(daily.close).toBe(curve[curve.length - 1]);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('computes the same curves and candles cold as live', () => {
    fc.assert(
      fc.property(
        arbSeries(),
        fc.constantFrom(...liveDays),
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom('5m' as const, '1h' as const, '1d' as const),
        (series, day, cachedDays, resolution) => {
          const cold = new PriceSource(context, history, state, { cachedDays });
          expect(cold.minuteCurve(series, day, lastTick)).toEqual(
            live.minuteCurve(series, day, lastTick),
          );
          cold.clearCaches();
          const from = dayStartTick(day);
          expect(cold.candles(series, resolution, from, lastTick, lastTick)).toEqual(
            live.candles(series, resolution, from, lastTick, lastTick),
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  it('keeps the prices of the other shares when a share is added', () => {
    const shareCount = mini.world.companies.length;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: shareCount - 1 }),
        fc.integer({ min: 1, max: END_DAY }),
        (template, toDay) => {
          const extended: World = {
            ...mini.world,
            companies: [
              ...mini.world.companies,
              { ...mini.world.companies[template], id: 'cmp-extra' },
            ],
          };
          const extendedContext = createMarketContext(
            mini.seedKey,
            extended,
            DEFAULT_MARKET_CONFIG,
          );
          const extendedState = createMarketState(extendedContext);
          advanceMarket(extendedContext, extendedState, toDay, {
            onDay: (day) => {
              const original = days.get(day.day) as MarketDay;
              expect(day.logOpen.subarray(0, shareCount)).toEqual(original.logOpen);
              expect(day.logClose.subarray(0, shareCount)).toEqual(original.logClose);
            },
          });
        },
      ),
      { numRuns: 10 },
    );
  });

  it('starts and ends every curve exactly on its support points', () => {
    const marketDays = [...days.keys()];
    fc.assert(
      fc.property(fc.constantFrom(...marketDays), arbSeries(), (dayIndexValue, series) => {
        const day = days.get(dayIndexValue) as MarketDay;
        expect(isMarketDay(day.day)).toBe(true);
        const curve = new DayCurves(tables).load(day).seriesCurve(series);
        const support = new SupportValues(tables, day);
        expect(curve[0]).toBe(support.value(series, 'open'));
        expect(curve[curve.length - 1]).toBe(support.value(series, 'close'));
      }),
      { numRuns: 50 },
    );
  });
});
