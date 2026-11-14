import fc from 'fast-check';

import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';

import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { MarketContext } from './market-context';
import {
  createFactorHistory,
  marketStateAt,
  recomputeFactorDays,
  recomputeInstrumentHistory,
  recomputeSupportDays,
} from './market-history';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { FactorHistory } from './models/market-state.model';
import { miniMarket } from './testing/mini-market';

const TO_DAY = dayIndex(dateTimeToTick({ year: 2022, month: 3, day: 15 }));

let context: MarketContext;
let history: FactorHistory;
/** Copies of every market day of the uninterrupted run, by day. */
let days: Map<number, MarketDay>;

/** Market days in `[fromDay, toDay)`. */
function marketDays(fromDay: number, toDay: number): number[] {
  const result: number[] = [];
  for (let day = fromDay; day < toDay; day++) {
    if (isMarketDay(day)) {
      result.push(day);
    }
  }
  return result;
}

const arbRange = fc
  .integer({ min: 0, max: TO_DAY - 1 })
  .chain((fromDay) =>
    fc.tuple(
      fc.constant(fromDay),
      fc.integer({ min: fromDay + 1, max: Math.min(TO_DAY, fromDay + 70) }),
    ),
  );

beforeAll(() => {
  context = miniMarket().context;
  history = createFactorHistory();
  days = new Map();
  advanceMarket(context, createMarketState(context), TO_DAY, {
    history,
    onDay: (day) => days.set(day.day, copyMarketDay(day)),
  });
});

describe('market history', () => {
  it('keeps the factor state of every month start', () => {
    // January 2020 to March 2022.
    expect(history.monthStarts).toHaveLength(27);
    expect(history.monthStarts[0].day).toBe(0);
    expect(history.monthStarts[1].day).toBe(
      dayIndex(dateTimeToTick({ year: 2020, month: 2, day: 1 })),
    );
  });

  describe('recomputeFactorDays', () => {
    it('recomputes the factor days of any range of the full run', () => {
      fc.assert(
        fc.property(arbRange, ([fromDay, toDay]) => {
          const recomputed: number[] = [];
          recomputeFactorDays(context, history, fromDay, toDay, (day) => {
            recomputed.push(day.day);
            expect(day.factorLevels).toEqual(days.get(day.day)?.factorLevels);
          });
          expect(recomputed).toEqual(marketDays(fromDay, toDay));
        }),
        { numRuns: 10 },
      );
    });

    it('fails without a month start state before the day', () => {
      expect(() => recomputeFactorDays(context, createFactorHistory(), 10, 20, () => {})).toThrow(
        RangeError,
      );
    });
  });

  describe('recomputeSupportDays', () => {
    it('recomputes all support points of any range bit for bit', () => {
      fc.assert(
        fc.property(arbRange, ([fromDay, toDay]) => {
          const recomputed: number[] = [];
          recomputeSupportDays(context, history, fromDay, toDay, (day) => {
            recomputed.push(day.day);
            expect(copyMarketDay(day)).toEqual(days.get(day.day));
          });
          expect(recomputed).toEqual(marketDays(fromDay, toDay));
        }),
        { numRuns: 10 },
      );
    });

    it('recomputes a single instrument of any range bit for bit', () => {
      const count = context.layout.instrumentIds.length;
      fc.assert(
        fc.property(arbRange, fc.integer({ min: 0, max: count - 1 }), ([fromDay, toDay], i) => {
          recomputeSupportDays(
            context,
            history,
            fromDay,
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
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('recomputeInstrumentHistory', () => {
    it('equals the history of the full run for every instrument, including the ex-dates', () => {
      const expectedDays = marketDays(0, TO_DAY);
      let exDates = 0;
      for (let i = 0; i < context.layout.instrumentIds.length; i++) {
        const instrument = recomputeInstrumentHistory(context, history, i, TO_DAY);
        expect(Array.from(instrument.days)).toEqual(expectedDays);
        instrument.days.forEach((day, n) => {
          const original = days.get(day) as MarketDay;
          expect(instrument.logClose[n]).toBe(original.logClose[i]);
          expect(instrument.exDividendCents[n]).toBe(original.exDividendCents[i]);
          exDates += instrument.exDividendCents[n] > 0 ? 1 : 0;
        });
      }
      expect(exDates).toBeGreaterThan(0);
    });
  });

  describe('marketStateAt', () => {
    it('equals the state of an uninterrupted run at 00:00 of the day', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: TO_DAY }), (day) => {
          const months = history.monthStarts.length;
          const state = marketStateAt(context, history, day);
          const reference = createMarketState(context);
          advanceMarket(context, reference, day);
          expect(state.day).toBe(day);
          expect(marketChecksum(state)).toBe(marketChecksum(reference));
          expect(history.monthStarts).toHaveLength(months);
        }),
        { numRuns: 10 },
      );
    });

    it('lacks the support points of the day itself', () => {
      // Monday, 14.03.2022: its closes come only with its own day step, the state holds Friday's.
      const day = TO_DAY - 1;
      const friday = day - 3;
      expect([isMarketDay(day), isMarketDay(friday)]).toEqual([true, true]);
      const state = marketStateAt(context, history, day);
      expect(Array.from(state.logClose)).not.toEqual(Array.from(days.get(day)?.logClose ?? []));
      expect(Array.from(state.logClose)).toEqual(Array.from(days.get(friday)?.logClose ?? []));
    });
  });
});
