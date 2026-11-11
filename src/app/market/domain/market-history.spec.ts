import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext } from './market-context';
import {
  createFactorHistory,
  recomputeFactorDays,
  recomputeInstrumentHistory,
  recomputeSupportDays,
} from './market-history';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';

import { dateTimeToTick, dayIndex } from '../../clock/domain/calendar-logic';
import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

const seedKey = deriveSeedKey('golden-1');
const context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);
const toDay = dayIndex(dateTimeToTick({ year: 2022, month: 3, day: 15 }));
const sampleFrom = dayIndex(dateTimeToTick({ year: 2022, month: 1, day: 20 }));

function fullRun() {
  const history = createFactorHistory();
  const closes = new Map<number, Float64Array>();
  const levels = new Map<number, Float64Array>();
  const days = new Map<number, MarketDay>();
  advanceMarket(context, createMarketState(context), toDay, {
    history,
    onDay: (day) => {
      closes.set(day.day, day.logClose.slice());
      levels.set(day.day, day.factorLevels.slice());
      if (day.day >= sampleFrom) {
        days.set(day.day, copyMarketDay(day));
      }
    },
  });
  return { history, closes, levels, days };
}

describe('market history', () => {
  const { history, closes, levels, days } = fullRun();

  it('keeps the factor state of every month start', () => {
    // January 2020 to March 2022.
    expect(history.monthStarts).toHaveLength(27);
    expect(history.monthStarts[0].day).toBe(0);
    expect(history.monthStarts[1].day).toBe(
      dayIndex(dateTimeToTick({ year: 2020, month: 2, day: 1 })),
    );
  });

  describe('recomputeFactorDays', () => {
    it('recomputes the factor days of the full run from a month start', () => {
      const fromDay = dayIndex(dateTimeToTick({ year: 2021, month: 6, day: 17 }));
      const recomputed: number[] = [];
      recomputeFactorDays(context, history, fromDay, toDay, (day) => {
        recomputed.push(day.day);
        expect(day.factorLevels).toEqual(levels.get(day.day));
      });
      expect(recomputed[0]).toBe(fromDay);
      expect(recomputed[recomputed.length - 1]).toBe(toDay - 1);
    });

    it('fails without a month start state before the day', () => {
      expect(() => recomputeFactorDays(context, createFactorHistory(), 10, 20, () => {})).toThrow(
        RangeError,
      );
    });
  });

  describe('recomputeSupportDays', () => {
    it('recomputes all support points bit for bit', () => {
      let count = 0;
      recomputeSupportDays(context, history, sampleFrom, toDay, (day) => {
        expect(copyMarketDay(day)).toEqual(days.get(day.day));
        count++;
      });
      expect(count).toBe(days.size);
    });

    it('recomputes a single instrument bit for bit', () => {
      const i = 123;
      recomputeSupportDays(
        context,
        history,
        sampleFrom,
        toDay,
        (day) => {
          const original = days.get(day.day) as MarketDay;
          expect(day.logOpen[i]).toBe(original.logOpen[i]);
          expect(day.logClose[i]).toBe(original.logClose[i]);
          expect(day.idioClose[i]).toBe(original.idioClose[i]);
          expect(day.jumpCount[i]).toBe(original.jumpCount[i]);
        },
        i,
      );
    });
  });

  describe('recomputeInstrumentHistory', () => {
    it('equals the history of the full run', () => {
      for (const i of [0, 57, 199]) {
        const instrument = recomputeInstrumentHistory(context, history, i, toDay);
        expect(instrument.days).toHaveLength(closes.size);
        instrument.days.forEach((day, n) => {
          expect(instrument.logClose[n]).toBe(closes.get(day)?.[i]);
        });
      }
    });
  });
});
