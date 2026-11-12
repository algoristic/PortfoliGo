import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { DIVIDENDS_PER_YEAR } from '@app/world/domain/models/taxonomy.model';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { ANNOUNCEMENT_LEAD_DAYS, dividendCents } from './dividend-logic';
import { stepInstrument } from './instrument-step';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { restoreMarket, snapshotMarket } from './market-snapshot';
import { advanceMarket, createMarketDay, createMarketState } from './market-step';
import { MarketState } from './models/market-state.model';
import { priceFromLog } from './price-logic';
import { END_OF_2020_DAY, goldenYear } from './testing/golden-year';

const FLOOR = DEFAULT_MARKET_CONFIG.priceFloor;
const START_2022 = dayIndex(dateTimeToTick({ year: 2022, month: 1, day: 1 }));

interface Announcement {
  day: number;
  exDay: number;
  cents: number;
  prevLog: number;
}

let context: MarketContext;
/** Market state at the start of 2021 (golden year); copies are taken from it. */
let start2021: MarketState;
/** A quarterly dividend payer, so 2021 has several announcements. */
let payer: number;
let announcements: Announcement[];
/** Changes of `nextExDay` per instrument in 2021. */
let exDateCounts: Int32Array;

/** Market state before `day` (≥ 2021), advanced on a copy of the golden state. */
function stateAt(day: number): MarketState {
  const state = restoreMarket(snapshotMarket(start2021));
  advanceMarket(context, state, day);
  return state;
}

/** Day step of one instrument on a copy of `state`, after a fresh factor-free market day. */
function stepCopy(state: MarketState, i: number, day: number) {
  const copy = restoreMarket(snapshotMarket(state));
  const out = createMarketDay(context);
  stepInstrument(context, i, day, copy, out);
  return { state: copy, out };
}

beforeAll(() => {
  const golden = goldenYear();
  context = golden.context;
  start2021 = golden.state;
  payer = context.layout.dividends.findIndex((dividend) => dividend?.frequency === 'quarterly');
  announcements = [];
  const state = restoreMarket(snapshotMarket(start2021));
  const previous = state.nextExDay.slice();
  exDateCounts = new Int32Array(previous.length);
  advanceMarket(context, state, START_2022, {
    onDay: (day) => {
      if (day.announcedExDay[payer] >= 0) {
        announcements.push({
          day: day.day,
          exDay: day.announcedExDay[payer],
          cents: day.announcedCents[payer],
          prevLog: day.prevLogClose[payer],
        });
      }
      state.nextExDay.forEach((next, i) => {
        if (next !== previous[i]) {
          exDateCounts[i]++;
          previous[i] = next;
        }
      });
    },
  });
});

describe('stepInstrument', () => {
  it('depends only on the day, the previous state and the factor levels', () => {
    const state = createMarketState(context);
    state.idioClose[42] = 0.3;
    const first = createMarketDay(context);
    const second = createMarketDay(context);
    second.jumpTotal = 5;
    const firstState = restoreMarket(snapshotMarket(state));
    const secondState = restoreMarket(snapshotMarket(state));
    stepInstrument(context, 42, 100, firstState, first);
    stepInstrument(context, 42, 100, secondState, second);
    expect(secondState.idioClose[42]).toBe(firstState.idioClose[42]);
    expect(second.logOpen[42]).toBe(first.logOpen[42]);
    expect(second.jumpCount[42]).toBe(first.jumpCount[42]);
    expect(second.jumpStart[42]).toBe(5);
  });

  it('includes the jumps of the day in the close', () => {
    const state = createMarketState(context);
    const day = createMarketDay(context);
    let found = false;
    for (let d = 0; d < 2000 && !found; d++) {
      day.jumpTotal = 0;
      stepInstrument(context, 0, d, state, day);
      found = day.jumpCount[0] > 0;
    }
    expect(found).toBe(true);
  });

  describe('dividends', () => {
    it('takes the dividend off the open on the ex-date', () => {
      const exDay = start2021.nextExDay[payer];
      expect(exDay).toBeGreaterThanOrEqual(END_OF_2020_DAY);
      const before = stateAt(exDay);
      expect(before.dividendCents[payer]).toBeGreaterThan(0);
      const withDividend = stepCopy(before, payer, exDay);
      const noExDate = restoreMarket(snapshotMarket(before));
      noExDate.nextExDay[payer] = exDay + 1;
      const withoutDividend = stepCopy(noExDate, payer, exDay);

      const cents = withDividend.out.exDividendCents[payer];
      expect(cents).toBe(before.dividendCents[payer]);
      expect(withoutDividend.out.exDividendCents[payer]).toBe(0);
      const openWith = priceFromLog(withDividend.out.logOpen[payer], FLOOR);
      const openWithout = priceFromLog(withoutDividend.out.logOpen[payer], FLOOR);
      expect(openWithout - openWith).toBeCloseTo(cents / 100, 9);
      expect(withDividend.state.nextExDay[payer]).toBeGreaterThan(exDay);
      expect(withDividend.state.dividendCents[payer]).toBeNaN();
    });

    it('announces 20 market days ahead the amount from the previous close (TS §6.5)', () => {
      const dividend = context.layout.dividends[payer];
      if (dividend === null) {
        throw new Error('test setup: no dividend payer');
      }
      expect(announcements.length).toBeGreaterThanOrEqual(DIVIDENDS_PER_YEAR.quarterly);
      for (const announcement of announcements) {
        let marketDays = 0;
        for (let d = announcement.day; d < announcement.exDay; d++) {
          marketDays += isMarketDay(d) ? 1 : 0;
        }
        expect(marketDays).toBe(ANNOUNCEMENT_LEAD_DAYS);
        expect(announcement.cents).toBe(
          dividendCents(
            dividend.yield,
            dividend.frequency,
            priceFromLog(announcement.prevLog, FLOOR),
          ),
        );
      }
    });

    it('announces an amount that does not depend on the announcement day', () => {
      // Changing everything that is drawn or computed for the announcement day leaves the amount.
      const announcementDay = announcements[announcements.length - 1].day;
      const before = stateAt(announcementDay);
      const plain = stepCopy(before, payer, announcementDay);
      const shifted = restoreMarket(snapshotMarket(before));
      const out = createMarketDay(context);
      out.factorLevels.fill(0.5);
      stepInstrument(context, payer, announcementDay + 7, shifted, out);
      expect(out.announcedCents[payer]).toBe(plain.out.announcedCents[payer]);
    });

    it('has the ex-dates of its frequency in every year', () => {
      context.layout.dividends.forEach((dividend, i) => {
        expect(exDateCounts[i]).toBe(
          dividend === null ? 0 : DIVIDENDS_PER_YEAR[dividend.frequency],
        );
      });
    });
  });
});
