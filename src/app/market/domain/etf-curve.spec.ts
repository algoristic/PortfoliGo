import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';

import { Checksum } from '@app/simulation/util/checksum';

import { detExp } from '@app/simulation/util/det-math';

import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { createCurveTables, DayCurves, SupportValues } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { calendarDaysSinceLastMarketDay } from './etf-step';
import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { createMarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { LOADINGS_PER_INSTRUMENT } from './market-layout';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { Prehistory, runPrehistory } from './prehistory';
import { priceFromLog } from './price-logic';
import { PriceSource } from './price-source';
import { etfSeries, seriesRef } from './series';

/** Changes when the ETF prices for existing seeds change; then raise `simVersion` (TS §15). */
const GOLDEN_1_ETFS_2020 = 'cd812cd0305bf456d1bf3efc03201239';

const seedKey = deriveSeedKey('golden-1');
const world = generateWorld(seedKey);
const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
const { layout, indices, etfs } = context;
const boundaryCount = layout.boundaries.length;
const floor = DEFAULT_MARKET_CONFIG.priceFloor;
const tables = createCurveTables(context);
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
const accumulating = etfs.distributions.findIndex((distribution) => distribution === null);
const distributing = etfs.distributions.findIndex((distribution) => distribution !== null);
const etfOpen = layout.boundaries[etfs.openBoundary[0]];
const etfClose = layout.boundaries[etfs.closeBoundary[0]];

/** First day of 2020 on which the distributing ETF goes ex with a payout. */
const etfExDay = days.find((day) => day.etfExCents[distributing] > 0) as MarketDay;

interface TenYears {
  prehistory: Prehistory;
  /** Accumulating and distributing ETF on the same index. */
  pairs: [number, number][];
  /** Units of the distributing ETF per pair when every payout is reinvested at the NAV. */
  units: number[];
  lastDay: MarketDay;
}

let tenYearsRun: TenYears | null = null;

/** Prehistory of ten years, run once for the tests that need it. */
function tenYears(): TenYears {
  if (tenYearsRun !== null) {
    return tenYearsRun;
  }
  const pairs: [number, number][] = [];
  for (let a = 0; a < etfs.ids.length; a++) {
    for (let d = 0; d < etfs.ids.length; d++) {
      if (
        etfs.distributions[a] === null &&
        etfs.distributions[d] !== null &&
        etfs.indexOf[a] === etfs.indexOf[d]
      ) {
        pairs.push([a, d]);
      }
    }
  }
  const units = pairs.map(() => 1);
  let lastDay: MarketDay | null = null;
  const prehistory = runPrehistory(seedKey, world, DEFAULT_MARKET_CONFIG, (day) => {
    const support = new SupportValues(tables, day);
    pairs.forEach(([, d], n) => {
      const cents = day.etfExCents[d];
      if (cents > 0) {
        units[n] *= 1 + cents / 100 / support.value(etfSeries(context, d), 'open');
      }
    });
    lastDay = day;
  });
  tenYearsRun = {
    prehistory,
    pairs,
    units,
    lastDay: copyMarketDay(lastDay as unknown as MarketDay),
  };
  return tenYearsRun;
}

describe('ETFs', () => {
  describe('createEtfLayout', () => {
    it('starts every ETF at its start price', () => {
      const source = new PriceSource(context, history, state);
      world.etfs.forEach((etf, e) => {
        expect(source.priceAt(etfSeries(context, e), 0, endOfToday)).toBeCloseTo(etf.startPrice, 9);
      });
    });

    it('trades all ETFs on the exchange of the configuration', () => {
      for (let e = 0; e < etfs.ids.length; e++) {
        expect(layout.boundaries[etfs.openBoundary[e]]).toBe(etfOpen);
        expect(layout.boundaries[etfs.closeBoundary[e]]).toBe(etfClose);
      }
    });

    it('computes the closed share of the underlying per interval', () => {
      const intervals = boundaryCount - 1;
      for (let e = 0; e < etfs.ids.length; e++) {
        for (let j = 0; j < intervals; j++) {
          const share = etfs.closedShare[e * intervals + j];
          expect(share).toBeGreaterThanOrEqual(0);
          expect(share).toBeLessThanOrEqual(1 + 1e-12);
        }
        // At night every exchange is closed.
        expect(etfs.closedShare[e * intervals]).toBeCloseTo(1, 12);
      }
    });
  });

  describe('stepEtfs', () => {
    it('counts the calendar days since the last market day', () => {
      // 01.01.2020 is a Wednesday (day 0), 06.01.2020 a Monday (day 5).
      expect(calendarDaysSinceLastMarketDay(0)).toBe(1);
      expect(calendarDaysSinceLastMarketDay(1)).toBe(1);
      expect(calendarDaysSinceLastMarketDay(5)).toBe(3);
    });

    it('takes off about the TER per year from k', () => {
      const { prehistory } = tenYears();
      const years = prehistory.state.day / 365.25;
      for (let e = 0; e < etfs.ids.length; e++) {
        const drift = Math.log(prehistory.state.etfScale[e] / etfs.initialScale[e]) / years;
        const sd = etfs.dailyTrackingSd[e] * Math.sqrt(DEFAULT_MARKET_CONFIG.tradingDaysPerYear);
        expect(Math.abs(drift + etfs.ter[e])).toBeLessThan((3 * sd) / Math.sqrt(years) + 1e-4);
      }
    });

    it('fills the pot only at the open of a constituent going ex', () => {
      let rises = 0;
      for (const day of days) {
        const x = etfs.indexOf[distributing];
        for (let j = 1; j < boundaryCount; j++) {
          const before = day.etfPot[distributing * boundaryCount + j - 1];
          const after = day.etfPot[distributing * boundaryCount + j];
          let exHere = false;
          for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
            const i = indices.members[n];
            exHere ||= day.exDividendCents[i] > 0 && layout.openBoundary[i] === j;
          }
          expect(after > before).toBe(exHere);
          rises += exHere ? 1 : 0;
        }
      }
      expect(rises).toBeGreaterThan(10);
    });

    it('pays out the pot of the previous close in whole cents at the open of its ex-date', () => {
      const index = days.indexOf(etfExDay);
      const previousPot = days[index - 1].etfPot[(distributing + 1) * boundaryCount - 1];
      const cents = etfExDay.etfExCents[distributing];
      const open = etfs.openBoundary[distributing];
      const remainder = previousPot - cents / 100;
      expect(remainder).toBeGreaterThanOrEqual(-1e-12);
      expect(remainder).toBeLessThan(0.01);
      expect(etfExDay.etfPot[distributing * boundaryCount + open - 1]).toBe(previousPot);
      const added = etfExDay.indexDividendPoints[etfs.indexOf[distributing] * boundaryCount + open];
      expect(etfExDay.etfPot[distributing * boundaryCount + open]).toBeCloseTo(
        remainder + etfExDay.etfScale[distributing] * added,
        12,
      );
      for (const day of days) {
        expect(day.etfExCents[accumulating]).toBe(0);
      }
    });

    it('gives accumulating and distributing ETFs the same total return before costs', () => {
      const { prehistory, pairs, units, lastDay } = tenYears();
      expect(pairs.length).toBeGreaterThan(0);
      const support = new SupportValues(tables, lastDay);
      const years = prehistory.state.day / 365.25;
      pairs.forEach(([a, d], n) => {
        const totalA = support.value(etfSeries(context, a), 'close') / lastDay.etfScale[a];
        const totalD =
          (units[n] * support.value(etfSeries(context, d), 'close')) / lastDay.etfScale[d];
        // The pot holds cash between the dividends and the payout: about 0.1–0.15 % p. a. cash drag
        // with annual payouts.
        expect(Math.abs(totalD / totalA - 1)).toBeLessThan(0.002 * years);
      });
    });
  });

  describe('curves', () => {
    it('equal k times the indicative level of the index with R or the pot at every minute', () => {
      const source = new PriceSource(context, history, state);
      for (const e of [accumulating, distributing]) {
        const x = etfs.indexOf[e];
        const curve = source.minuteCurve(etfSeries(context, e), etfExDay.day, endOfToday);
        expect(curve.length).toBe(etfClose - etfOpen + 1);
        for (let m = 0; m < curve.length; m += 7) {
          const tick = dayStartTick(etfExDay.day) + etfOpen + m;
          let sum = 0;
          for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
            sum += indices.shares[n] * source.indicativeAt(indices.members[n], tick, endOfToday);
          }
          const level = sum / indices.divisor[x];
          let j = 0;
          while (j + 1 < boundaryCount && layout.boundaries[j + 1] <= etfOpen + m) {
            j++;
          }
          const scale = etfExDay.etfScale[e];
          const expected =
            e === distributing
              ? scale * level + etfExDay.etfPot[e * boundaryCount + j]
              : scale * level * etfExDay.indexReinvest[x * boundaryCount + j];
          expect(curve[m]).toBe(expected);
        }
      }
    });

    it('open and close from the support points equal the curve bit for bit', () => {
      for (const day of days.slice(-40)) {
        const curves = new DayCurves(tables).load(day);
        const support = new SupportValues(tables, day);
        for (let e = 0; e < etfs.ids.length; e++) {
          const series = etfSeries(context, e);
          const curve = curves.seriesCurve(series);
          expect(support.value(series, 'open')).toBe(curve[0]);
          expect(support.value(series, 'close')).toBe(curve[curve.length - 1]);
        }
      }
    });

    it('give the same curves live, recomputed and after discarding the caches', () => {
      const recomputed = new PriceSource(context, history, state, { cachedDays: 1 });
      for (let day = endOf2020 - 8; day < endOf2020; day++) {
        if (!isMarketDay(day)) {
          continue;
        }
        for (const e of [accumulating, distributing]) {
          const series = etfSeries(context, e);
          const liveCurve = live.minuteCurve(series, day, endOfToday);
          expect(recomputed.minuteCurve(series, day, endOfToday)).toEqual(liveCurve);
          recomputed.clearCaches();
          expect(recomputed.minuteCurve(series, day, endOfToday)).toEqual(liveCurve);
        }
      }
    });

    it('build daily candles whose open and close are the support values', () => {
      const source = new PriceSource(context, history, state);
      const series = etfSeries(context, distributing);
      const candles = source.candles(
        series,
        '1d',
        dayStartTick(today - 13),
        endOfToday,
        endOfToday,
      );
      expect(candles.length).toBe(10);
      for (const candle of candles) {
        const day = days.find((entry) => entry.day === dayIndex(candle.tick)) as MarketDay;
        const support = new SupportValues(tables, day);
        expect(candle.open).toBe(support.value(series, 'open'));
        expect(candle.close).toBe(support.value(series, 'close'));
        expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
        expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      }
    });

    it('never return values after now', () => {
      const series = etfSeries(context, accumulating);
      expect(seriesRef(context, series).kind).toBe('etf');
      const now = dayStartTick(today) + etfOpen + 30;
      expect(live.minuteCurve(series, today, now).length).toBe(31);
      expect(() => live.priceAt(series, now + 1, now)).toThrow(RangeError);
      expect(() => live.indicativeAt(series, now + 1, now)).toThrow(RangeError);
    });

    it('never change the market state', () => {
      const before = marketChecksum(state);
      const source = new PriceSource(context, history, state);
      source.candles(etfSeries(context, 0), '1d', dayStartTick(today - 30), endOfToday, endOfToday);
      source.indicativeAt(etfSeries(context, 1), endOfToday, endOfToday);
      source.quoteAt(etfSeries(context, 2), endOfToday, endOfToday, 0.001);
      expect(marketChecksum(state)).toBe(before);
    });

    it('match the golden checksum over the opens and closes of the first year', () => {
      const checksum = new Checksum();
      for (const day of days) {
        const support = new SupportValues(tables, day);
        for (let e = 0; e < etfs.ids.length; e++) {
          checksum.addFloat64(support.value(etfSeries(context, e), 'open'));
          checksum.addFloat64(support.value(etfSeries(context, e), 'close'));
        }
      }
      expect(checksum.digest()).toBe(GOLDEN_1_ETFS_2020);
    });

    it('compute all ETF curves of a day within the CI bound', () => {
      const sample = days.slice(-20);
      let etfMs = 0;
      let supportMs = 0;
      for (const day of sample) {
        const curves = new DayCurves(tables).load(day);
        for (let i = 0; i < layout.instrumentIds.length; i++) {
          curves.instrumentCurve(i);
        }
        const start = performance.now();
        for (let e = 0; e < etfs.ids.length; e++) {
          curves.seriesCurve(etfSeries(context, e));
        }
        etfMs += performance.now() - start;
        const supportStart = performance.now();
        const support = new SupportValues(tables, day);
        for (let e = 0; e < etfs.ids.length; e++) {
          support.value(etfSeries(context, e), 'open');
          support.value(etfSeries(context, e), 'close');
        }
        supportMs += performance.now() - supportStart;
      }
      const perDay = etfMs / sample.length;
      console.info(
        `ETF curves per trading day: ${perDay.toFixed(2)} ms on top of the minute curves, ` +
          `opens and closes from the support points: ${(supportMs / sample.length).toFixed(2)} ms`,
      );
      expect(perDay).toBeLessThan(50);
    });
  });

  describe('indicative values', () => {
    const source = new PriceSource(context, history, state);
    const day = days[days.length - 2];
    const previous = days[days.length - 3];

    function factorPart(target: MarketDay, i: number, boundary: number): number {
      let sum = 0;
      for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
        const k = layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l];
        sum +=
          layout.loadings[i * LOADINGS_PER_INSTRUMENT + l] *
          target.factorLevels[k * boundaryCount + boundary];
      }
      return sum;
    }

    it('equal the price inside the session of shares and ETFs', () => {
      for (const series of [0, 120, etfSeries(context, 3)]) {
        for (let minute = 0; minute <= MINUTES_PER_DAY; minute += 37) {
          const tick = dayStartTick(day.day) + minute;
          const { kind, index } = seriesRef(context, series);
          const open = layout.boundaries[(kind === 'etf' ? etfs : layout).openBoundary[index]];
          const close = layout.boundaries[(kind === 'etf' ? etfs : layout).closeBoundary[index]];
          if (minute >= open && minute <= close) {
            expect(source.indicativeAt(series, tick, endOfToday)).toBe(
              source.priceAt(series, tick, endOfToday),
            );
          }
        }
      }
    });

    it('move the close with the factors after the close', () => {
      // An Asian share after its close, at the boundaries of the later exchanges.
      const i = layout.openBoundary.findIndex((boundary) => layout.boundaries[boundary] < 180);
      expect(i).toBeGreaterThanOrEqual(0);
      const close = layout.closeBoundary[i];
      let checked = 0;
      for (let b = close + 1; b < boundaryCount - 1; b++) {
        const tick = dayStartTick(day.day) + layout.boundaries[b];
        checked++;
        const expected =
          priceFromLog(day.logClose[i], floor) *
          detExp(factorPart(day, i, b) - factorPart(day, i, close));
        expect(source.indicativeAt(i, tick, endOfToday) / expected).toBeCloseTo(1, 10);
      }
      expect(checked).toBeGreaterThan(3);
    });

    it('move the previous close with the factors before the open', () => {
      // A North American share at 00:00 of a weekday after a weekday.
      expect(day.day - previous.day).toBe(1);
      const i = layout.openBoundary.findIndex((boundary) => layout.boundaries[boundary] > 900);
      expect(i).toBeGreaterThanOrEqual(0);
      const expected =
        priceFromLog(day.prevLogClose[i], floor) *
        detExp(factorPart(day, i, 0) - factorPart(previous, i, layout.closeBoundary[i]));
      const value = source.indicativeAt(i, dayStartTick(day.day), endOfToday);
      expect(value / expected).toBeCloseTo(1, 10);
      expect(value).not.toBe(source.priceAt(i, dayStartTick(day.day), endOfToday));
    });
  });
});
