import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { DIVIDENDS_PER_YEAR } from '@app/world/domain/models/taxonomy.model';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { ANNOUNCEMENT_LEAD_DAYS, dividendCents } from './dividend-logic';
import { stepInstrument } from './instrument-step';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { InstrumentDividend, WORLD_FACTOR } from './market-layout';
import { restoreMarket, snapshotMarket } from './market-snapshot';
import { advanceMarket, createMarketDay, createMarketState } from './market-step';
import { MarketState } from './models/market-state.model';
import { priceFromLog } from './price-logic';
import { END_OF_2020_DAY, goldenYear } from './testing/golden-year';

const FLOOR = DEFAULT_MARKET_CONFIG.priceFloor;
const START_2022 = dayIndex(dateTimeToTick({ year: 2022, month: 1, day: 1 }));
/** At most this many calendar days lie between an announcement and its ex-date. */
const ANNOUNCEMENT_CALENDAR_DAYS = 28;

/**
 * Target yield of the dividend lifecycle on `day` (TS §6.5, E-33), written out: the log markdown
 * ỹ = −f·ln(1 − y/f) moves from the start yield to the long-run yield at the rate κ_y over the
 * market days since the start of the payments, y = f·(1 − e^{−ỹ/f}).
 */
function lifecycleYield(dividend: InstrumentDividend, day: number): number {
  const { longRunYield, yieldReversion, initialYield } = DEFAULT_MARKET_CONFIG.dividendLifecycle;
  const perYear = DIVIDENDS_PER_YEAR[dividend.frequency];
  const drag = (value: number): number => -perYear * Math.log(1 - value / perYear);
  const start = drag(dividend.yield > 0 ? dividend.yield : initialYield);
  const longRun = drag(longRunYield);
  let marketDays = 0;
  for (let d = dividend.startDay; d < day; d++) {
    marketDays += isMarketDay(d) ? 1 : 0;
  }
  const years = marketDays / DEFAULT_MARKET_CONFIG.tradingDaysPerYear;
  const current = longRun + (start - longRun) * Math.exp(-yieldReversion * years);
  return perYear * (1 - Math.exp(-current / perYear));
}

interface Announcement {
  day: number;
  exDay: number;
  cents: number;
  prevLog: number;
}

let context: MarketContext;
/** Market state at the start of 2021 (golden year); copies are taken from it. */
let start2021: MarketState;
/** A quarterly dividend payer since the epoch, so 2021 has several announcements. */
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
  payer = context.layout.dividends.findIndex(
    (dividend) => dividend !== null && dividend.yield > 0 && dividend.frequency === 'quarterly',
  );
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

  it('scales the diffusion of the day with (s_world / s̄_world)^φ (TS §6.4, 7.1b-02)', () => {
    // The overnight shock has no drift: four times the world factor volatility moves it 4^φ times.
    const { idioVolCoupling, phases, referencePhase } = DEFAULT_MARKET_CONFIG;
    const reference = phases[referencePhase].volTarget;
    const day = 100;
    const moves = [reference, 4 * reference].map((worldVol) => {
      const state = createMarketState(context);
      const out = createMarketDay(context);
      out.factorVols[WORLD_FACTOR] = worldVol;
      stepInstrument(context, 42, day, state, out);
      return out.idioOpen[42] - out.prevIdioClose[42];
    });
    expect(moves[1] / moves[0]).toBeCloseTo(4 ** idioVolCoupling, 12);
  });

  it('keeps the transient part apart and adds its change to U (E-22 new)', () => {
    const state = createMarketState(context);
    state.idioTransient[42] = 0.2;
    state.idioClose[42] = 0.5;
    const out = createMarketDay(context);
    out.factorVols[WORLD_FACTOR] = DEFAULT_MARKET_CONFIG.phases.normal.volTarget;
    const same = restoreMarket(snapshotMarket(state));
    same.idioTransient[42] = 0;
    same.idioClose[42] = 0.3;
    const sameOut = createMarketDay(context);
    sameOut.factorVols[WORLD_FACTOR] = DEFAULT_MARKET_CONFIG.phases.normal.volTarget;
    stepInstrument(context, 42, 100, state, out);
    stepInstrument(context, 42, 100, same, sameOut);
    // Only T returns: 0.2 more T at the start leaves e^{−θ·Δ_T}·0.2 more of T and of U.
    const kept = Math.exp(-DEFAULT_MARKET_CONFIG.idioReversion / 261) * 0.2;
    expect(state.idioTransient[42] - same.idioTransient[42]).toBeCloseTo(kept, 12);
    expect(state.idioClose[42] - same.idioClose[42]).toBeCloseTo(kept, 12);
    // 0.2 more of the permanent part stays whole.
    const permanent = restoreMarket(snapshotMarket(same));
    permanent.idioClose[42] = 0.5;
    const permanentOut = createMarketDay(context);
    permanentOut.factorVols[WORLD_FACTOR] = DEFAULT_MARKET_CONFIG.phases.normal.volTarget;
    const base = restoreMarket(snapshotMarket(same));
    base.idioClose[42] = 0.3;
    base.idioTransient[42] = 0;
    permanent.idioTransient[42] = 0;
    const baseOut = createMarketDay(context);
    baseOut.factorVols[WORLD_FACTOR] = DEFAULT_MARKET_CONFIG.phases.normal.volTarget;
    stepInstrument(context, 42, 101, permanent, permanentOut);
    stepInstrument(context, 42, 101, base, baseOut);
    expect(permanent.idioClose[42] - base.idioClose[42]).toBeCloseTo(0.2, 12);
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

    it('announces 20 market days ahead the amount from the target yield of the day and the previous close (TS §6.5)', () => {
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
            lifecycleYield(dividend, announcement.day),
            dividend.frequency,
            priceFromLog(announcement.prevLog, FLOOR),
          ),
        );
      }
    });

    it('announces an amount that does not depend on the draws and prices of the announcement day', () => {
      // Other draws (a later day) and other factor levels and volatilities: only the target yield
      // of the day and the previous close enter (TS §6.5).
      const dividend = context.layout.dividends[payer];
      if (dividend === null) {
        throw new Error('test setup: no dividend payer');
      }
      const announcementDay = announcements[announcements.length - 1].day;
      const before = stateAt(announcementDay);
      const shifted = restoreMarket(snapshotMarket(before));
      const out = createMarketDay(context);
      out.factorLevels.fill(0.5);
      out.factorVols.fill(0.3);
      stepInstrument(context, payer, announcementDay + 7, shifted, out);
      expect(out.announcedCents[payer]).toBe(
        dividendCents(
          lifecycleYield(dividend, announcementDay + 7),
          dividend.frequency,
          priceFromLog(before.logClose[payer], FLOOR),
        ),
      );
    });

    it('has the ex-dates of its frequency in every year once the payments started', () => {
      context.layout.dividends.forEach((dividend, i) => {
        if (dividend === null || dividend.startDay >= START_2022) {
          expect(exDateCounts[i]).toBe(0);
        } else if (dividend.startDay <= END_OF_2020_DAY) {
          expect(exDateCounts[i]).toBe(DIVIDENDS_PER_YEAR[dividend.frequency]);
        } else {
          expect(exDateCounts[i]).toBeLessThanOrEqual(DIVIDENDS_PER_YEAR[dividend.frequency]);
        }
      });
    });

    it('lets a company without a dividend at the epoch start to pay at its start day (E-33)', () => {
      let later = -1;
      context.layout.dividends.forEach((dividend, i) => {
        const current = later < 0 ? null : context.layout.dividends[later];
        if (
          dividend !== null &&
          dividend.yield === 0 &&
          dividend.startDay > END_OF_2020_DAY &&
          (current === null || dividend.startDay < current.startDay)
        ) {
          later = i;
        }
      });
      const dividend = context.layout.dividends[later];
      if (dividend === null) {
        throw new Error('test setup: no later payer');
      }
      const announced: Announcement[] = [];
      const exDays: number[] = [];
      const state = restoreMarket(snapshotMarket(start2021));
      advanceMarket(context, state, dividend.startDay + 400, {
        onDay: (day) => {
          if (day.announcedExDay[later] >= 0) {
            announced.push({
              day: day.day,
              exDay: day.announcedExDay[later],
              cents: day.announcedCents[later],
              prevLog: day.prevLogClose[later],
            });
          }
          if (day.exDividendCents[later] > 0) {
            exDays.push(day.day);
          }
        },
      });
      expect(announced.length).toBeGreaterThan(0);
      expect(announced[0].day).toBeGreaterThanOrEqual(
        dividend.startDay - ANNOUNCEMENT_CALENDAR_DAYS,
      );
      expect(exDays.length).toBeGreaterThan(0);
      expect(exDays[0]).toBeGreaterThanOrEqual(dividend.startDay);
      expect(exDays[0]).toBe(announced[0].exDay);
      expect(announced[0].cents).toBe(
        dividendCents(
          lifecycleYield(dividend, announced[0].day),
          dividend.frequency,
          priceFromLog(announced[0].prevLog, FLOOR),
        ),
      );
    });
  });
});
