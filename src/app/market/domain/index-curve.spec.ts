import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { World } from '@app/world/domain/models/world.model';

import { dailyCandlesFromSupport } from './candle-logic';
import { MarketContext } from './market-context';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';
import { PriceSource } from './price-source';
import { indexSeries, totalReturnSeries } from './series';
import { goldenYear } from './testing/golden-year';

let world: World;
let context: MarketContext;
let history: FactorHistory;
let state: MarketState;
let days: readonly MarketDay[];
let today: number;
let endOfToday: number;
let worldIndex: number;
let leadingIndex: number;
/** A day of 2020 on which a constituent of the world index goes ex. */
let exDay: MarketDay;

beforeAll(() => {
  ({ world, context, history, state, days, today, endOfToday } = goldenYear());
  const { indices } = context;
  worldIndex = world.indices.findIndex((index) => index.kind === 'world');
  leadingIndex = world.indices.findIndex((index) => index.kind === 'region-leading');
  exDay = days.find((day) => {
    for (let n = indices.memberStart[worldIndex]; n < indices.memberStart[worldIndex + 1]; n++) {
      if (day.exDividendCents[indices.members[n]] > 0) {
        return true;
      }
    }
    return false;
  }) as MarketDay;
});

function weightedSum(source: PriceSource, x: number, tick: number): number {
  const { indices } = context;
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

  it('equal the weighted sum of their constituents at every minute (TS §6.6)', () => {
    const source = new PriceSource(context, history, state);
    const mismatches: string[] = [];
    for (const x of [worldIndex, leadingIndex]) {
      for (let minute = 0; minute < MINUTES_PER_DAY; minute++) {
        const tick = dayStartTick(exDay.day) + minute;
        const level = source.priceAt(indexSeries(context, x), tick, endOfToday);
        if (level !== weightedSum(source, x, tick)) {
          mismatches.push(`index ${x}, minute ${minute}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('raise the reinvestment factor only at the open of a constituent going ex', () => {
    const { layout, indices } = context;
    const boundaryCount = layout.boundaries.length;
    const mismatches: string[] = [];
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
          if (after > before !== exHere || after < before) {
            mismatches.push(`day ${day.day}, index ${x}, boundary ${j}`);
          }
          changes += exHere ? 1 : 0;
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(changes).toBeGreaterThan(100);
  });

  it('give the dividend back in the total return index at the open of the ex-date', () => {
    const { layout, indices } = context;
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
});
