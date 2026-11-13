import { dayStartTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { DailyCloses } from './daily-closes';
import { createCurveTables, CurveTables } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { MarketContext } from './market-context';
import { FactorHistory } from './models/market-state.model';
import { runPrehistory } from './prehistory';
import { PriceSource } from './price-source';
import { etfSeries, seriesCount } from './series';

describe('DailyCloses', () => {
  let context: MarketContext;
  let history: FactorHistory;
  let tables: CurveTables;
  let prices: PriceSource;
  /** Ex-dividends of shares and ETFs per day as the original run reported them. */
  const stockDividends = new Map<number, Float64Array>();
  const etfDividends = new Map<number, Float64Array>();

  beforeAll(() => {
    const { seedKey, world } = miniWorld();
    const prehistory = runPrehistory(seedKey, world, DEFAULT_MARKET_CONFIG, (day) => {
      stockDividends.set(day.day, Float64Array.from(day.exDividendCents));
      etfDividends.set(day.day, Float64Array.from(day.etfExCents));
    });
    ({ context, history } = prehistory);
    tables = createCurveTables(context);
    prices = new PriceSource(context, history, prehistory.state);
  });

  function closeTick(series: number, day: number): number {
    const { layout, indices, etfs } = context;
    const stocks = layout.instrumentIds.length;
    const x = series - stocks;
    const boundary =
      series < stocks
        ? layout.closeBoundary[series]
        : series < etfSeries(context, 0)
          ? indices.closeBoundary[x % indices.ids.length]
          : etfs.closeBoundary[series - etfSeries(context, 0)];
    return dayStartTick(day) + layout.boundaries[boundary] * TICKS_PER_MINUTE;
  }

  /** Market days spread over several months of the prehistory, including month starts. */
  function sampleDays(): number[] {
    const days: number[] = [];
    for (let day = 3_000; day < 3_400; day += 23) {
      if (isMarketDay(day)) {
        days.push(day);
      }
    }
    return days;
  }

  it('keeps only the closes of the first series when asked to', () => {
    const days = sampleDays().slice(0, 3);
    const all = new DailyCloses(context, history, tables);
    const withoutEtfs = new DailyCloses(context, history, tables, etfSeries(context, 0));
    all.prepare(days, days);
    withoutEtfs.prepare(days, days);
    for (const day of days) {
      for (let series = 0; series < etfSeries(context, 0); series++) {
        expect(withoutEtfs.close(series, day)).toBe(all.close(series, day));
      }
      expect(() => withoutEtfs.close(etfSeries(context, 0), day)).toThrow(RangeError);
      expect(withoutEtfs.dividendCents(etfSeries(context, 0), day)).toBe(
        all.dividendCents(etfSeries(context, 0), day),
      );
    }
  });

  it('gives the closes of the minute curves for every series', () => {
    const closes = new DailyCloses(context, history, tables);
    const days = sampleDays();
    closes.prepare(days, []);
    for (const day of days) {
      for (let s = 0; s < seriesCount(context); s++) {
        expect(closes.close(s, day)).toBe(prices.priceAt(s, closeTick(s, day), GAME_START_TICK));
      }
    }
  });

  it('gives the ex-dividends of shares and ETFs as the original run had them', () => {
    const closes = new DailyCloses(context, history, tables);
    const days: number[] = [];
    for (let day = 2_500; day < 2_900; day++) {
      if (isMarketDay(day)) {
        days.push(day);
      }
    }
    closes.prepare([], days);
    const stocks = context.layout.instrumentIds.length;
    let paid = 0;
    for (const day of days) {
      const live = stockDividends.get(day);
      const etfLive = etfDividends.get(day);
      for (let i = 0; i < stocks; i++) {
        expect(closes.dividendCents(i, day)).toBe(live?.[i]);
        paid += closes.dividendCents(i, day);
      }
      for (let e = 0; e < context.etfs.ids.length; e++) {
        expect(closes.dividendCents(etfSeries(context, e), day)).toBe(etfLive?.[e]);
      }
      for (let s = stocks; s < etfSeries(context, 0); s++) {
        expect(closes.dividendCents(s, day)).toBe(0);
      }
    }
    expect(paid).toBeGreaterThan(0);
  });

  it('keeps only the days of the last request', () => {
    const closes = new DailyCloses(context, history, tables);
    // Mon 20.03.2028 … Thu 23.03.2028 (days 3001–3004).
    closes.prepare([3_001, 3_002], [3_003]);
    expect(closes.days).toEqual([3_001, 3_002, 3_003]);
    closes.prepare([3_002], [3_004]);
    expect(closes.days).toEqual([3_002, 3_004]);
    expect(() => closes.close(0, 3_001)).toThrow(RangeError);
    // A dividend day has no closes until they are asked for.
    expect(() => closes.close(0, 3_004)).toThrow(RangeError);
    closes.prepare([3_004], []);
    expect(closes.close(0, 3_004)).toBe(prices.priceAt(0, closeTick(0, 3_004), GAME_START_TICK));
  });
});
