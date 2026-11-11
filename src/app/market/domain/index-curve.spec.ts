import { dailyCandlesFromSupport } from './candle-logic';
import { createCurveTables, DayCurves } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { createMarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { runPrehistory } from './prehistory';
import { priceFromLog } from './price-logic';
import { PriceSource } from './price-source';
import { etfSeries, indexSeries, seriesRef, totalReturnSeries } from './series';

import { dateTimeToTick, dayIndex, dayStartTick } from '../../clock/domain/calendar-logic';
import { MINUTES_PER_DAY } from '../../clock/domain/models/time.model';
import { Checksum } from '../../simulation/util/checksum';
import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

/** Changes when the index levels for existing seeds change; then raise `simVersion` (TS §15). */
const GOLDEN_1_INDICES_2020 = '1e90013fa05b8e742d8f29cbe3af8a96';

const seedKey = deriveSeedKey('golden-1');
const world = generateWorld(seedKey);
const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
const { layout, indices } = context;
const floor = DEFAULT_MARKET_CONFIG.priceFloor;
const endOf2020 = dayIndex(dateTimeToTick({ year: 2021, month: 1, day: 1 }));
const today = endOf2020 - 1;
const endOfToday = dayStartTick(today + 1) - 1;
const history = createFactorHistory();
const state = createMarketState(context);
const live = new PriceSource(context, history, state);
const days: MarketDay[] = [];
advanceMarket(context, state, endOf2020, {
  history,
  onDay: (day) => {
    days.push(copyMarketDay(day));
    if (day.day >= endOf2020 - 8) {
      live.rememberDay(day);
    }
  },
});
const worldIndex = world.indices.findIndex((index) => index.kind === 'world');
const leadingIndex = world.indices.findIndex((index) => index.kind === 'region-leading');

/** A day of 2020 on which a constituent of the world index goes ex. */
const exDay = days.find((day) => {
  for (let n = indices.memberStart[worldIndex]; n < indices.memberStart[worldIndex + 1]; n++) {
    if (day.exDividendCents[indices.members[n]] > 0) {
      return true;
    }
  }
  return false;
}) as MarketDay;

function weightedSum(source: PriceSource, x: number, tick: number): number {
  let sum = 0;
  for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
    sum += indices.shares[n] * source.priceAt(indices.members[n], tick, endOfToday);
  }
  return sum / indices.divisor[x];
}

describe('indices', () => {
  it('start at their base value', () => {
    const source = new PriceSource(context, history, state);
    world.indices.forEach((index, x) => {
      expect(source.priceAt(indexSeries(context, x), 0, endOfToday)).toBeCloseTo(
        index.baseValue,
        6,
      );
      expect(source.priceAt(totalReturnSeries(context, x), 0, endOfToday)).toBeCloseTo(
        index.baseValue,
        6,
      );
    });
  });

  it('equal the weighted sum of their constituents at every minute', () => {
    const source = new PriceSource(context, history, state);
    for (const x of [worldIndex, leadingIndex]) {
      for (let minute = 0; minute < MINUTES_PER_DAY; minute++) {
        const tick = dayStartTick(exDay.day) + minute;
        expect(source.priceAt(indexSeries(context, x), tick, endOfToday)).toBe(
          weightedSum(source, x, tick),
        );
      }
    }
  });

  it('raise the reinvestment factor only at the open of a constituent going ex', () => {
    const boundaryCount = layout.boundaries.length;
    let changes = 0;
    for (const day of days) {
      for (let x = 0; x < indices.ids.length; x++) {
        for (let j = 1; j < boundaryCount; j++) {
          const before = day.indexReinvest[x * boundaryCount + j - 1];
          const after = day.indexReinvest[x * boundaryCount + j];
          let exHere = false;
          for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
            const i = indices.members[n];
            exHere ||= day.exDividendCents[i] > 0 && layout.openBoundary[i] === j;
          }
          expect(after > before).toBe(exHere);
          expect(after < before).toBe(false);
          changes += exHere ? 1 : 0;
        }
      }
    }
    expect(changes).toBeGreaterThan(100);
  });

  it('give the dividend back in the total return index at the open of the ex-date', () => {
    const source = new PriceSource(context, history, state);
    const x = worldIndex;
    const priceCurve = source.minuteCurve(indexSeries(context, x), exDay.day, endOfToday);
    const totalCurve = source.minuteCurve(totalReturnSeries(context, x), exDay.day, endOfToday);
    const open = layout.boundaries[indices.openBoundary[x]];
    const pointsByMinute = new Map<number, number>();
    for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
      const i = indices.members[n];
      const cents = exDay.exDividendCents[i];
      const m = layout.boundaries[layout.openBoundary[i]] - open;
      if (cents > 0 && m > 0) {
        const points = (indices.shares[n] * cents) / 100 / indices.divisor[x];
        pointsByMinute.set(m, (pointsByMinute.get(m) ?? 0) + points);
      }
    }
    expect(pointsByMinute.size).toBeGreaterThan(0);
    for (const [m, points] of pointsByMinute) {
      const reinvestJump = totalCurve[m] / priceCurve[m] / (totalCurve[m - 1] / priceCurve[m - 1]);
      expect(reinvestJump - 1).toBeCloseTo(points / priceCurve[m - 1], 4);
    }
  });

  it('grow the total return index faster by about the dividend yield', () => {
    const prehistory = runPrehistory(seedKey, world);
    const years = prehistory.state.day / 365.25;
    const x = worldIndex;
    let weightedYield = 0;
    let weight = 0;
    for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
      const i = indices.members[n];
      const value = indices.shares[n] * priceFromLog(prehistory.state.logClose[i], floor);
      weightedYield += value * (layout.dividends[i]?.yield ?? 0);
      weight += value;
    }
    const reinvestYield = Math.log(prehistory.state.indexReinvest[x]) / years;
    expect(reinvestYield).toBeGreaterThan(0.5 * (weightedYield / weight));
    expect(reinvestYield).toBeLessThan(1.5 * (weightedYield / weight));
  });

  it('give the same curves live, recomputed and after discarding the caches', () => {
    const recomputed = new PriceSource(context, history, state, { cachedDays: 1 });
    for (let day = endOf2020 - 8; day < endOf2020; day++) {
      if (!isMarketDay(day)) {
        continue;
      }
      for (const series of [indexSeries(context, worldIndex), totalReturnSeries(context, 3)]) {
        const liveCurve = live.minuteCurve(series, day, endOfToday);
        expect(recomputed.minuteCurve(series, day, endOfToday)).toEqual(liveCurve);
        recomputed.clearCaches();
        expect(recomputed.minuteCurve(series, day, endOfToday)).toEqual(liveCurve);
      }
    }
  });

  it('build daily candles whose open and close are the support values', () => {
    const source = new PriceSource(context, history, state);
    const series = totalReturnSeries(context, leadingIndex);
    const candles = source.candles(series, '1d', dayStartTick(today - 13), endOfToday, endOfToday);
    expect(candles.length).toBe(10);
    for (const candle of candles) {
      const day = days.find((entry) => entry.day === dayIndex(candle.tick)) as MarketDay;
      const support = dailyCandlesFromSupport(context, day)[series];
      expect(candle.open).toBe(support.open);
      expect(candle.close).toBe(support.close);
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
    }
  });

  it('never return values after now', () => {
    const series = indexSeries(context, worldIndex);
    const { kind } = seriesRef(context, series);
    expect(kind).toBe('index');
    const open = layout.boundaries[indices.openBoundary[worldIndex]];
    const now = dayStartTick(today) + open + 30;
    expect(live.minuteCurve(series, today, now).length).toBe(31);
    expect(() => live.priceAt(series, now + 1, now)).toThrow(RangeError);
  });

  it('never change the market state', () => {
    const before = marketChecksum(state);
    const source = new PriceSource(context, history, state);
    source.candles(
      indexSeries(context, worldIndex),
      '1d',
      dayStartTick(today - 30),
      endOfToday,
      endOfToday,
    );
    source.priceAt(totalReturnSeries(context, 2), endOfToday, endOfToday);
    expect(marketChecksum(state)).toBe(before);
  });

  it('match the golden checksum over the opens and closes of the first year', () => {
    const checksum = new Checksum();
    const first = indexSeries(context, 0);
    for (const day of days) {
      const candles = dailyCandlesFromSupport(context, day);
      for (let series = first; series < etfSeries(context, 0); series++) {
        checksum.addFloat64(candles[series].open);
        checksum.addFloat64(candles[series].close);
      }
    }
    expect(checksum.digest()).toBe(GOLDEN_1_INDICES_2020);
  });

  it('compute all index curves of a day within the CI bound', () => {
    const tables = createCurveTables(context);
    const sample = days.slice(-20);
    const start = performance.now();
    let indexMs = 0;
    for (const day of sample) {
      const curves = new DayCurves(tables).load(day);
      for (let i = 0; i < layout.instrumentIds.length; i++) {
        curves.instrumentCurve(i);
      }
      const indexStart = performance.now();
      for (let x = 0; x < indices.ids.length; x++) {
        curves.seriesCurve(indexSeries(context, x));
        curves.seriesCurve(totalReturnSeries(context, x));
      }
      indexMs += performance.now() - indexStart;
    }
    const total = (performance.now() - start) / sample.length;
    const perDay = indexMs / sample.length;
    console.info(
      `index curves per trading day: ${perDay.toFixed(2)} ms on top of ${total.toFixed(1)} ms for all minute curves`,
    );
    expect(perDay).toBeLessThan(50);
  });
});
