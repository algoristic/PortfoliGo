import fc from 'fast-check';

import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { createHighLowFill, DayHighLow } from './high-low-fill';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState } from './market-step';
import { FactorHistory } from './models/market-state.model';
import { PriceSource } from './price-source';
import { goldenYear } from './testing/golden-year';
import { miniMarket } from './testing/mini-market';

/** Range of the mini world: 18.02. up to (excluding) 20.03.2020. */
const FROM_DAY = dayIndex(dateTimeToTick({ year: 2020, month: 2, day: 18 }));
const TO_DAY = dayIndex(dateTimeToTick({ year: 2020, month: 3, day: 20 }));

let context: MarketContext;
let history: FactorHistory;
let all: DayHighLow[];

function runAll(fromDay: number, toDay: number, maxDays: number): DayHighLow[] {
  const fill = createHighLowFill(context, history, fromDay, toDay);
  const results: DayHighLow[] = [];
  let slices = 0;
  while (!fill.run(maxDays, (result) => results.push(result))) {
    slices++;
    expect(slices).toBeLessThan(1000);
  }
  return results;
}

beforeAll(() => {
  context = miniMarket().context;
  history = createFactorHistory();
  advanceMarket(context, createMarketState(context), TO_DAY, { history });
  all = runAll(FROM_DAY, TO_DAY, Number.MAX_SAFE_INTEGER);
});

describe('createHighLowFill', () => {
  it('processes every trading day once, newest first', () => {
    const expected: number[] = [];
    for (let day = TO_DAY - 1; day >= FROM_DAY; day--) {
      if (isMarketDay(day)) {
        expected.push(day);
      }
    }
    expect(all.map((result) => result.day)).toEqual(expected);
  });

  it('does not depend on the size of the time slices', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (maxDays) => {
        expect(runAll(FROM_DAY, TO_DAY, maxDays)).toEqual(all);
      }),
      { numRuns: 5 },
    );
  });

  it('matches the daily candles of the price source of the golden world', () => {
    const golden = goldenYear();
    const now = golden.endOfToday;
    const fromDay = golden.today - 13;
    const fill = createHighLowFill(golden.context, golden.history, fromDay, golden.today + 1);
    const byDay: DayHighLow[] = [];
    fill.run(Number.MAX_SAFE_INTEGER, (result) => byDay.unshift(result));
    const source = new PriceSource(golden.context, golden.history, golden.state);
    for (const i of [0, 88, 199]) {
      const daily = source.candles(i, '1d', dayStartTick(fromDay), now, now);
      expect(daily).toHaveLength(byDay.length);
      daily.forEach((candle, n) => {
        expect(candle.high).toBe(byDay[n].high[i]);
        expect(candle.low).toBe(byDay[n].low[i]);
      });
    }
  });

  it('is done immediately for an empty range', () => {
    const fill = createHighLowFill(context, history, TO_DAY, TO_DAY);
    const onDay = vi.fn();
    expect(fill.run(1, onDay)).toBe(true);
    expect(onDay).not.toHaveBeenCalled();
  });
});
