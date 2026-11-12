import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { detExp } from '@app/simulation/util/det-math';
import { World } from '@app/world/domain/models/world.model';

import { CurveTables, DayCurves, SupportValues } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { calendarDaysSinceLastMarketDay } from './etf-step';
import { MarketContext } from './market-context';
import { LOADINGS_PER_INSTRUMENT } from './market-layout';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';
import { priceFromLog } from './price-logic';
import { PriceSource } from './price-source';
import { etfSeries, seriesRef } from './series';
import { goldenYear } from './testing/golden-year';

const floor = DEFAULT_MARKET_CONFIG.priceFloor;

let world: World;
let context: MarketContext;
let layout: MarketContext['layout'];
let etfs: MarketContext['etfs'];
let indices: MarketContext['indices'];
let tables: CurveTables;
let history: FactorHistory;
let state: MarketState;
let days: readonly MarketDay[];
let today: number;
let endOfToday: number;
let boundaryCount: number;
let accumulating: number;
let distributing: number;
let etfOpen: number;
let etfClose: number;
/** First day of 2020 on which the distributing ETF goes ex with a payout. */
let etfExDay: MarketDay;

beforeAll(() => {
  ({ world, context, tables, history, state, days, today, endOfToday } = goldenYear());
  ({ layout, etfs, indices } = context);
  boundaryCount = layout.boundaries.length;
  accumulating = etfs.distributions.findIndex((distribution) => distribution === null);
  distributing = etfs.distributions.findIndex((distribution) => distribution !== null);
  etfOpen = layout.boundaries[etfs.openBoundary[0]];
  etfClose = layout.boundaries[etfs.closeBoundary[0]];
  etfExDay = days.find((day) => day.etfExCents[distributing] > 0) as MarketDay;
});

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

    it('fills the pot only at the open of a constituent going ex', () => {
      const x = etfs.indexOf[distributing];
      const mismatches: string[] = [];
      let rises = 0;
      for (const day of days) {
        for (let j = 1; j < boundaryCount; j++) {
          const before = day.etfPot[distributing * boundaryCount + j - 1];
          const after = day.etfPot[distributing * boundaryCount + j];
          let exHere = false;
          for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
            const i = indices.members[n];
            exHere ||= day.exDividendCents[i] > 0 && layout.openBoundary[i] === j;
          }
          if (after > before !== exHere) {
            mismatches.push(`day ${day.day}, boundary ${j}`);
          }
          rises += exHere ? 1 : 0;
        }
      }
      expect(mismatches).toEqual([]);
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
      // Constituents of earlier sessions may already have gone ex on the same day.
      const beforeOpen = etfExDay.etfPot[distributing * boundaryCount + open - 1];
      expect(beforeOpen).toBeGreaterThanOrEqual(previousPot);
      const added = etfExDay.indexDividendPoints[etfs.indexOf[distributing] * boundaryCount + open];
      expect(etfExDay.etfPot[distributing * boundaryCount + open]).toBeCloseTo(
        beforeOpen - cents / 100 + etfExDay.etfScale[distributing] * added,
        12,
      );
      for (const day of days) {
        expect(day.etfExCents[accumulating]).toBe(0);
      }
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
      // Golden example; market-properties.spec.ts checks this for any day of the mini world.
      for (const day of days.slice(-5)) {
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
  });

  describe('indicative values', () => {
    let source: PriceSource;
    let day: MarketDay;
    let previous: MarketDay;

    beforeAll(() => {
      source = new PriceSource(context, history, state);
      day = days[days.length - 2];
      previous = days[days.length - 3];
    });

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
