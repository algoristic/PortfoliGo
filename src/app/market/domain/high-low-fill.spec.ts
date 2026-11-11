import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createHighLowFill, DayHighLow } from './high-low-fill';
import { createMarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState, isMarketDay } from './market-step';
import { PriceSource } from './price-source';

import { dateTimeToTick, dayIndex, dayStartTick } from '../../clock/domain/calendar-logic';
import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

const seedKey = deriveSeedKey('golden-1');
const context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);
const history = createFactorHistory();
const state = createMarketState(context);
const toDay = dayIndex(dateTimeToTick({ year: 2020, month: 5, day: 20 }));
advanceMarket(context, state, toDay, { history });
const fromDay = dayIndex(dateTimeToTick({ year: 2020, month: 2, day: 18 }));

function runAll(maxDays: number): DayHighLow[] {
  const fill = createHighLowFill(context, history, fromDay, toDay);
  const results: DayHighLow[] = [];
  let slices = 0;
  while (!fill.run(maxDays, (result) => results.push(result))) {
    slices++;
    expect(slices).toBeLessThan(1000);
  }
  return results;
}

describe('createHighLowFill', () => {
  const all = runAll(Number.MAX_SAFE_INTEGER);

  it('processes every trading day once, newest first', () => {
    const expected: number[] = [];
    for (let day = toDay - 1; day >= fromDay; day--) {
      if (isMarketDay(day)) {
        expected.push(day);
      }
    }
    expect(all.map((result) => result.day)).toEqual(expected);
  });

  it('does not depend on the size of the time slices', () => {
    expect(runAll(1)).toEqual(all);
    expect(runAll(7)).toEqual(all);
  });

  it('matches the daily candles of the price source', () => {
    const source = new PriceSource(context, history, state);
    const now = dayStartTick(toDay) - 1;
    for (const i of [0, 88, 199]) {
      const daily = source.candles(i, '1d', dayStartTick(fromDay), now, now);
      const byDay = [...all].reverse();
      daily.forEach((candle, n) => {
        expect(candle.high).toBe(byDay[n].high[i]);
        expect(candle.low).toBe(byDay[n].low[i]);
      });
    }
  });

  it('is done immediately for an empty range', () => {
    const fill = createHighLowFill(context, history, toDay, toDay);
    const onDay = vi.fn();
    expect(fill.run(1, onDay)).toBe(true);
    expect(onDay).not.toHaveBeenCalled();
  });
});
