import { DailyCloses } from '@app/market/domain/daily-closes';
import { createCurveTables } from '@app/market/domain/day-curve';
import { instrumentCatalog } from '@app/market/domain/instrument-catalog';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { ScreenerRow } from '@app/market/domain/models/screener.model';

import { GameEngine } from './game-engine';
import { marketMovers, rankMovers, ScreenerSources, screenInstruments } from './market-screen';
import { SeriesQuote } from './models/series-quote.model';
import { miniGame } from './testing/mini-game';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / 60_000;
}

function dayOf(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - EPOCH_MS) / DAY_MS;
}

/** The last minute of a day: every session has closed, the price is the day's close. */
function lateTick(day: number): number {
  return day * 1_440 + 1_439;
}

function isWeekday(day: number): boolean {
  const weekday = new Date(EPOCH_MS + day * DAY_MS).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Wed 12.06.2030, 12:00: Europe trades since 09:00, North America opens at 15:30.
const NOW = tick(2030, 6, 12, 12);
const TODAY = dayOf(2030, 6, 12);

function quote(series: number, changeRatio: number): SeriesQuote {
  return { series, last: 1, bid: null, ask: null, previousClose: 1, change: 0, changeRatio };
}

describe('rankMovers', () => {
  it('ranks the largest gains and losses, ties in series order, without unchanged shares', () => {
    const quotes = [
      quote(0, 0.01),
      quote(1, -0.03),
      quote(2, 0.05),
      quote(3, 0),
      quote(4, 0.01),
      quote(5, -0.01),
      quote(6, 0.02),
    ];
    const { gainers, losers } = rankMovers(quotes, 3);
    expect(gainers.map(({ series }) => series)).toEqual([2, 6, 0]);
    expect(losers.map(({ series }) => series)).toEqual([1, 5]);
  });
});

describe('market screen', () => {
  let engine: GameEngine;
  let history: FactorHistory;
  let catalog: Instrument[];
  let sources: ScreenerSources;

  beforeAll(() => {
    const mini = miniGame();
    engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
    engine.runUntil(tick(2030, 7, 1));
    history = { monthStarts: [...engine.monthStartsAfter(-1)] };
    const { world, context } = engine.world;
    catalog = instrumentCatalog(world, context);
    sources = {
      context,
      catalog,
      prices: engine.prices,
      closes: new DailyCloses(context, history, createCurveTables(context)),
    };
  });

  /** Opening minute of the exchange of a share or ETF, from the world. */
  function openOf(instrument: Instrument): number {
    const exchange = engine.world.world.exchanges.find(({ id }) => id === instrument.exchangeId);
    if (exchange === undefined) {
      throw new Error(`no exchange for ${instrument.id}`);
    }
    return exchange.open;
  }

  /** Ex-dividends of one share in `[from, to)`, stepping only that share (TS §6.8). */
  function exDividends(i: number, from: number, to: number): [number, number][] {
    const result: [number, number][] = [];
    const step = (day: { day: number; exDividendCents: Float64Array }): void => {
      if (day.exDividendCents[i] > 0) {
        result.push([day.day, day.exDividendCents[i]]);
      }
    };
    recomputeSupportDays(engine.world.context, history, from, to, step, i);
    return result;
  }

  function rowOf(rows: readonly ScreenerRow[], id: string): ScreenerRow {
    const row = rows.find((candidate) => candidate.id === id);
    if (row === undefined) {
      throw new Error(`no row ${id}`);
    }
    return row;
  }

  it('returns every series with its current price', () => {
    const { total, rows } = screenInstruments(sources, {}, NOW);
    expect(total).toBe(catalog.length);
    expect(rows).toHaveLength(catalog.length);
    for (const row of rows) {
      expect(row.last).toBe(engine.prices.priceAt(row.series, NOW, NOW));
    }
  });

  it('measures the performance against the close before 1, 6, 12 and 60 months', () => {
    // TS §8.2: 12.05.2030 is a Sunday → Fri 10.05.; 12.12.2029 Wed; 12.06.2029 Tue; 12.06.2025 Thu.
    const references = {
      m1: dayOf(2030, 5, 10),
      m6: dayOf(2029, 12, 12),
      y1: dayOf(2029, 6, 12),
      y5: dayOf(2025, 6, 12),
    };
    const { rows } = screenInstruments(sources, {}, NOW);
    for (const row of rows) {
      for (const [period, day] of Object.entries(references)) {
        const reference = engine.prices.priceAt(row.series, lateTick(day), NOW);
        expect(row.performance[period as keyof typeof references]).toBeCloseTo(
          row.last / reference - 1,
          12,
        );
      }
    }
  });

  it('draws one month of closes up to the previous close, then the current price', () => {
    const { rows } = screenInstruments(sources, {}, NOW);
    for (const instrument of catalog.filter(({ kind }) => kind !== 'index')) {
      // Opened today: the previous close is Tuesday's, else Monday's.
      const lastClose = openOf(instrument) <= 720 ? dayOf(2030, 6, 11) : dayOf(2030, 6, 10);
      const days: number[] = [];
      for (let day = lastClose; days.length < 21; day--) {
        if (isWeekday(day)) {
          days.unshift(day);
        }
      }
      const row = rowOf(rows, instrument.id);
      expect(row.sparkline).toEqual([
        ...days.map((day) => engine.prices.priceAt(instrument.series, lateTick(day), NOW)),
        row.last,
      ]);
    }
    rows.forEach(({ sparkline }) => expect(sparkline).toHaveLength(22));
  });

  it('sums the dividends of the last twelve months for the yield', () => {
    const { rows } = screenInstruments(sources, {}, NOW);
    let payers = 0;
    catalog
      .filter(({ kind }) => kind === 'stock')
      .forEach((instrument) => {
        let cents = 0;
        exDividends(instrument.series, dayOf(2029, 6, 13), TODAY + 1).forEach(([day, amount]) => {
          cents += day < TODAY || openOf(instrument) <= 720 ? amount : 0;
        });
        const row = rowOf(rows, instrument.id);
        expect(row.dividendYield).toBeCloseTo(cents / 100 / row.last, 12);
        payers += cents > 0 ? 1 : 0;
      });
    expect(payers).toBeGreaterThan(0);
    for (const instrument of catalog.filter(({ kind }) => kind !== 'stock')) {
      const value = rowOf(rows, instrument.id).dividendYield;
      if (instrument.kind === 'index') {
        expect(value).toBeNull();
      } else if (instrument.kind === 'etf' && instrument.distribution === 'accumulating') {
        expect(value).toBe(0);
      } else {
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('counts the ex-date of today from the open of the exchange', () => {
    // A share with an ex-date in June 2030 after the 12th.
    const juneFrom = dayOf(2030, 6, 13);
    const juneTo = dayOf(2030, 6, 29);
    let found: { instrument: Instrument; day: number; cents: number } | undefined;
    for (const instrument of catalog.filter(({ kind }) => kind === 'stock')) {
      const [first] = exDividends(instrument.series, juneFrom, juneTo + 1);
      if (found === undefined && first !== undefined) {
        found = { instrument, day: first[0], cents: first[1] };
      }
    }
    if (found === undefined) {
      throw new Error('no ex-date in June 2030');
    }
    const { instrument, day, cents } = found;
    const open = openOf(instrument);
    const before = day * 1_440 + open - 1;
    const at = day * 1_440 + open;
    const search = { search: instrument.isin ?? '' };
    const [rowBefore] = screenInstruments(sources, search, before).rows;
    const [rowAt] = screenInstruments(sources, search, at).rows;
    const centsBefore = (rowBefore.dividendYield ?? 0) * rowBefore.last * 100;
    const centsAt = (rowAt.dividendYield ?? 0) * rowAt.last * 100;
    expect(centsAt - centsBefore).toBeCloseTo(cents, 6);
  });

  it('filters by the yield range and sorts by a metric', () => {
    const all = screenInstruments(sources, {}, NOW).rows;
    const range = { min: 0.005, max: 0.04 };
    const { total, rows } = screenInstruments(
      sources,
      { dividendYield: range, sort: { key: 'y1', direction: 'desc' } },
      NOW,
    );
    const expected = all
      .filter(
        ({ dividendYield }) =>
          dividendYield !== null && dividendYield >= range.min && dividendYield <= range.max,
      )
      .map(({ id, performance }) => ({ id, y1: performance.y1 ?? 0 }))
      .sort((a, b) => b.y1 - a.y1);
    expect(total).toBe(expected.length);
    expect(rows.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
  });

  it('finds the series whose name, ticker or ISIN contain the search text', () => {
    const text = catalog[3].ticker.toLowerCase();
    const { rows } = screenInstruments(sources, { search: text.toUpperCase() }, NOW);
    const expected = catalog
      .filter(({ name, ticker, isin }) =>
        [name, ticker, isin ?? ''].some((field) => field.toLowerCase().includes(text)),
      )
      .map(({ id }) => id)
      .sort();
    expect(rows.map(({ id }) => id).sort()).toEqual(expected);
    expect(expected).toContain(catalog[3].id);
  });

  it('reads no price after the query tick, before the open on a Monday', () => {
    // The price source throws for any tick after `now` (TS §4.5, rule 7).
    const now = tick(2030, 6, 3, 8);
    expect(() => screenInstruments(sources, {}, now)).not.toThrow();
  });

  describe('marketMovers', () => {
    it('ranks the shares by their change against the previous close', () => {
      const { world, context } = engine.world;
      const movers = marketMovers(world, context, engine.prices, NOW, 3);
      const changes = catalog
        .filter(({ kind }) => kind === 'stock')
        .map((instrument) => {
          const previous = openOf(instrument) <= 720 ? dayOf(2030, 6, 11) : dayOf(2030, 6, 10);
          const last = engine.prices.priceAt(instrument.series, NOW, NOW);
          const close = engine.prices.priceAt(instrument.series, lateTick(previous), NOW);
          return { series: instrument.series, ratio: last / close - 1 };
        });
      const gainers = changes
        .filter(({ ratio }) => ratio > 0)
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 3);
      const losers = changes
        .filter(({ ratio }) => ratio < 0)
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 3);
      expect(movers.gainers.map(({ series }) => series)).toEqual(gainers.map((g) => g.series));
      expect(movers.losers.map(({ series }) => series)).toEqual(losers.map((l) => l.series));
      movers.gainers.forEach((q, n) => expect(q.changeRatio).toBeCloseTo(gainers[n].ratio, 12));
    });

    it('reports the price index of every sector', () => {
      const { world, context } = engine.world;
      const { sectors } = marketMovers(world, context, engine.prices, NOW);
      const sectorIndices = world.indices.filter(({ kind }) => kind === 'sector');
      expect(sectors.map(({ sectorId }) => sectorId)).toEqual(
        sectorIndices.map(({ sectorId }) => sectorId),
      );
      sectors.forEach(({ quote: sectorQuote }, n) => {
        const instrument = catalog.find(({ id }) => id === sectorIndices[n].id);
        expect(sectorQuote.series).toBe(instrument?.series);
        expect(sectorQuote.bid).toBeNull();
      });
    });
  });
});
