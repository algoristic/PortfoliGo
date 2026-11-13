import { DailyCloses } from '@app/market/domain/daily-closes';
import { createCurveTables } from '@app/market/domain/day-curve';
import { instrumentCatalog } from '@app/market/domain/instrument-catalog';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';

import { GameEngine } from './game-engine';
import { InstrumentFacts } from './instrument-figures';
import { screenInstruments } from './market-screen';
import { EngineEvent } from './models/engine-event.model';
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

function dayOfTick(at: number): number {
  return Math.floor(at / 1_440);
}

function isWeekday(day: number): boolean {
  const weekday = new Date(EPOCH_MS + day * DAY_MS).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** The last minute of a day: every session has closed, the price is the day's close. */
function lateTick(day: number): number {
  return day * 1_440 + 1_439;
}

/** Reference: annualised sample standard deviation of daily log returns. */
function referenceVolatility(closes: readonly number[]): number {
  const returns = closes.slice(1).map((close, n) => Math.log(close / closes[n]));
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const squares = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0);
  return Math.sqrt((squares / (returns.length - 1)) * 252);
}

/** Reference: covariance of the log returns ÷ variance of the benchmark's. */
function referenceBeta(closes: readonly number[], benchmark: readonly number[]): number {
  const r = closes.slice(1).map((close, n) => Math.log(close / closes[n]));
  const b = benchmark.slice(1).map((close, n) => Math.log(close / benchmark[n]));
  const mr = r.reduce((sum, x) => sum + x, 0) / r.length;
  const mb = b.reduce((sum, x) => sum + x, 0) / b.length;
  let covariance = 0;
  let variance = 0;
  for (let n = 0; n < r.length; n++) {
    covariance += (r[n] - mr) * (b[n] - mb);
    variance += (b[n] - mb) ** 2;
  }
  return covariance / variance;
}

// Game start Mon 01.04.2030; the engine runs to 01.02.2032 so the next dividends of every query
// time are known from the engine's own events (the oracle of the dividend tests).
const START_DAY = dayOf(2030, 4, 1);
const END = tick(2032, 2, 1);
// Wed 12.06.2030, 12:00: Europe trades since 09:00, North America opens at 15:30.
const NOW = tick(2030, 6, 12, 12);
const TODAY = dayOf(2030, 6, 12);

type ExEvent = Extract<EngineEvent, { type: 'ex-dividend' }>;
type AnnouncedEvent = Extract<EngineEvent, { type: 'dividend-announced' }>;

describe('InstrumentFacts', () => {
  let engine: GameEngine;
  let history: FactorHistory;
  let catalog: Instrument[];
  let facts: InstrumentFacts;
  let exEvents: ExEvent[];
  let announcements: AnnouncedEvent[];
  let worldIndex: Instrument;

  beforeAll(() => {
    const mini = miniGame();
    engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
    engine.runUntil(END);
    const events = engine.drainEvents();
    exEvents = events.filter((event): event is ExEvent => event.type === 'ex-dividend');
    announcements = events.filter(
      (event): event is AnnouncedEvent => event.type === 'dividend-announced',
    );
    history = { monthStarts: [...engine.monthStartsAfter(-1)] };
    const { world, context } = engine.world;
    catalog = instrumentCatalog(world, context);
    const world0 = world.indices.find(({ kind }) => kind === 'world');
    worldIndex = catalog.find(({ id }) => id === world0?.id) as Instrument;
  });

  // A fresh instance per test: the code under test runs inside the test (mutation tests).
  beforeEach(() => {
    const { world, context } = engine.world;
    facts = new InstrumentFacts({
      world,
      context,
      catalog,
      prices: engine.prices,
      history,
      tables: createCurveTables(context),
      indicative: null,
    });
  });

  function byKind(kind: Instrument['kind']): Instrument[] {
    return catalog.filter((instrument) => instrument.kind === kind);
  }

  /** Closes of the 253 weekdays before `today`, oldest first, from the minute curves. */
  function windowCloses(series: number, today: number, now: number): number[] {
    const days: number[] = [];
    for (let day = today - 1; days.length < 253; day--) {
      if (isWeekday(day)) {
        days.unshift(day);
      }
    }
    return days.map((day) => engine.prices.priceAt(series, lateTick(day), now));
  }

  describe('figures', () => {
    it('computes volatility and beta from the closes of the last 252 market days', () => {
      const benchmark = windowCloses(worldIndex.series, TODAY, NOW);
      const sample = [
        ...byKind('stock').slice(0, 4),
        ...byKind('etf').slice(0, 3),
        ...byKind('index').slice(0, 3),
      ];
      for (const instrument of sample) {
        const closes = windowCloses(instrument.series, TODAY, NOW);
        const figures = facts.figures(instrument, NOW);
        expect(figures.volatility).toBeCloseTo(referenceVolatility(closes), 9);
        expect(figures.beta).toBeCloseTo(referenceBeta(closes, benchmark), 9);
      }
      expect(facts.figures(worldIndex, NOW).beta).toBe(1);
    });

    it('measures the performance against the close before 1, 12 and 60 months', () => {
      // TS §8.2: 12.05.2030 is a Sunday → Fri 10.05.; 12.06.2029 Tue; 12.06.2025 Thu.
      const references = { m1: dayOf(2030, 5, 10), y1: dayOf(2029, 6, 12), y5: dayOf(2025, 6, 12) };
      for (const instrument of [byKind('stock')[3], byKind('etf')[0], worldIndex]) {
        const figures = facts.figures(instrument, NOW);
        const last = engine.prices.priceAt(instrument.series, NOW, NOW);
        expect(figures.last).toBe(last);
        for (const [period, day] of Object.entries(references)) {
          const reference = engine.prices.priceAt(instrument.series, lateTick(day), NOW);
          expect(figures.performance[period as keyof typeof references]).toBeCloseTo(
            last / reference - 1,
            12,
          );
        }
      }
    });

    it('gives the market capitalisation of shares and the yield of the screener', () => {
      const { rows } = screenInstruments(
        {
          context: engine.world.context,
          catalog,
          prices: engine.prices,
          closes: new DailyCloses(
            engine.world.context,
            history,
            createCurveTables(engine.world.context),
          ),
        },
        {},
        NOW,
      );
      for (const instrument of catalog) {
        const figures = facts.figures(instrument, NOW);
        const row = rows.find(({ id }) => id === instrument.id);
        expect(figures.dividendYield).toBe(row?.dividendYield);
        const company = engine.world.world.companies.find(({ id }) => id === instrument.id);
        expect(figures.marketCap).toBe(
          company === undefined ? null : company.sharesOutstanding * figures.last,
        );
        expect(figures.indicativeValue).toBeNull();
      }
    });

    it('moves the window with the market day and answers the same day alike', () => {
      const stock = byKind('stock')[1];
      const monday = tick(2030, 6, 17, 10);
      const saturday = tick(2030, 6, 15, 10);
      const sunday = tick(2030, 6, 16, 20);
      // Saturday to Monday share the window up to Friday.
      expect(facts.figures(stock, saturday).volatility).toBe(
        facts.figures(stock, monday).volatility,
      );
      expect(facts.figures(stock, sunday).beta).toBe(facts.figures(stock, monday).beta);
      const closes = windowCloses(stock.series, dayOf(2030, 6, 18), tick(2030, 6, 18, 1));
      expect(facts.figures(stock, tick(2030, 6, 18, 1)).volatility).toBeCloseTo(
        referenceVolatility(closes),
        9,
      );
    });
    it('has no volatility, beta or long performance while the window reaches before the epoch', () => {
      // Wed 10.06.2020: 115 market days since the epoch.
      const early = tick(2020, 6, 10, 12);
      for (const instrument of [byKind('stock')[0], byKind('etf')[0], worldIndex]) {
        const figures = facts.figures(instrument, early);
        expect(figures).toMatchObject({ volatility: null, beta: null });
        expect(figures.performance.y1).toBeNull();
        expect(figures.performance.y5).toBeNull();
        expect(figures.performance.m1).toBeCloseTo(
          figures.last /
            engine.prices.priceAt(instrument.series, lateTick(dayOf(2020, 5, 8)), early) -
            1,
          12,
        );
      }
    });

    it('passes the indicative value of the price source through', () => {
      const { world, context } = engine.world;
      const withIndicative = new InstrumentFacts({
        world,
        context,
        catalog,
        prices: engine.prices,
        history,
        tables: createCurveTables(context),
        indicative: (series, now) => series * 1_000 + now,
      });
      const etf = byKind('etf')[0];
      expect(withIndicative.figures(etf, NOW).indicativeValue).toBe(etf.series * 1_000 + NOW);
    });
  });

  describe('dividends', () => {
    /** Noon of every Wednesday and Saturday from June to December 2030. */
    const NOWS = Array.from({ length: 30 }, (_, week) => [
      tick(2030, 6, 5 + 7 * week, 12),
      tick(2030, 6, 8 + 7 * week, 12),
    ]).flat();

    function expectedNext(series: number, now: number, withAmounts: boolean) {
      const ex = exEvents.find((event) => event.series === series && event.tick > now);
      if (ex === undefined) {
        throw new Error(`no ex-date after ${now}`);
      }
      const exDay = dayOfTick(ex.tick);
      const announced = announcements.find(
        (event) => event.series === series && event.exDay === exDay && event.tick <= now,
      );
      return {
        exDay,
        paymentDay: ex.paymentDay,
        cents: withAmounts && announced !== undefined ? announced.cents : null,
      };
    }

    function expectedHistory(series: number, now: number) {
      return exEvents
        .filter((event) => event.series === series && event.tick <= now)
        .map((event) => ({
          exDay: dayOfTick(event.tick),
          paymentDay: event.paymentDay,
          cents: event.cents,
        }))
        .reverse();
    }

    it('lists the paid dividends of shares up to now and the next date with announced amounts', () => {
      let announcedSeen = 0;
      let unannouncedSeen = 0;
      for (const company of engine.world.world.companies) {
        const instrument = catalog.find(({ id }) => id === company.id) as Instrument;
        const paying = exEvents.some(({ series }) => series === instrument.series);
        for (const now of NOWS) {
          const { history: paid, next } = facts.dividends(instrument, now);
          // The engine's events start with the game; older payments come from the prehistory.
          expect(paid.filter(({ exDay }) => exDay >= START_DAY)).toEqual(
            expectedHistory(instrument.series, now),
          );
          expect(paid.every(({ exDay }) => exDay > dayOf(2025, 6, 1))).toBe(true);
          if (!paying) {
            continue;
          }
          const expected = expectedNext(instrument.series, now, true);
          if (company.dividend.startDay > dayOfTick(now) && expected.cents === null) {
            expect(next).toBeNull();
            continue;
          }
          expect(next).toEqual(expected);
          if (expected.cents === null) {
            unannouncedSeen++;
          } else {
            announcedSeen++;
          }
        }
      }
      expect(announcedSeen).toBeGreaterThan(20);
      expect(unannouncedSeen).toBeGreaterThan(20);
    });

    it('moves today’s ex-date into the history at the open of the series', () => {
      const ex = exEvents.find(({ series, tick: at }) => series < 24 && at > NOW) as ExEvent;
      const instrument = catalog[ex.series];
      const before = facts.dividends(instrument, ex.tick - 1);
      expect(before.next).toEqual({
        exDay: dayOfTick(ex.tick),
        paymentDay: ex.paymentDay,
        cents: ex.cents,
      });
      expect(before.history[0]?.exDay ?? -1).toBeLessThan(dayOfTick(ex.tick));
      const after = facts.dividends(instrument, ex.tick);
      expect(after.history[0]).toEqual({
        exDay: dayOfTick(ex.tick),
        paymentDay: ex.paymentDay,
        cents: ex.cents,
      });
      expect(after.next?.exDay).toBeGreaterThan(dayOfTick(ex.tick));
    });

    it('lists the distributions of ETFs without announced amounts', () => {
      const distributing = byKind('etf').filter(
        (etf) => etf.kind === 'etf' && etf.distribution === 'distributing',
      );
      expect(distributing.length).toBeGreaterThan(0);
      for (const etf of distributing) {
        for (const now of NOWS) {
          const { history: paid, next } = facts.dividends(etf, now);
          expect(paid.filter(({ exDay }) => exDay >= START_DAY)).toEqual(
            expectedHistory(etf.series, now),
          );
          expect(next).toEqual(expectedNext(etf.series, now, false));
        }
      }
      for (const instrument of [
        ...byKind('index'),
        ...byKind('etf').filter((etf) => !distributing.includes(etf)),
      ]) {
        expect(facts.dividends(instrument, NOW)).toEqual({ history: [], next: null });
      }
    });
  });

  describe('composition', () => {
    it('weights the constituents by capped free-float shares × the last close', () => {
      const { context, world } = engine.world;
      const { indices, layout } = context;
      const lastDay = dayOf(2030, 6, 11);
      for (const instrument of [...byKind('index'), ...byKind('etf')]) {
        const composition = facts.composition(instrument, NOW);
        const indexId = instrument.kind === 'stock' ? '' : instrument.indexId;
        const x = indices.ids.indexOf(indexId);
        const values: { id: string; value: number }[] = [];
        for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
          const i = indices.members[n];
          values.push({
            id: layout.instrumentIds[i],
            value: indices.shares[n] * engine.prices.priceAt(i, lateTick(lastDay), NOW),
          });
        }
        const total = values.reduce((sum, { value }) => sum + value, 0);
        const definition = world.indices.find(({ id }) => id === indexId);
        expect(composition?.indexId).toBe(indexId);
        expect(composition?.constituentCount).toBe(definition?.constituents.length);
        const top = composition?.top ?? [];
        expect(top.length).toBe(Math.min(10, values.length));
        const largest = [...values].sort((a, b) => b.value - a.value).slice(0, top.length);
        top.forEach((position, n) => {
          expect(position.weight).toBeCloseTo(largest[n].value / total, 12);
        });
        const regionSum = (composition?.regions ?? []).reduce((sum, { weight }) => sum + weight, 0);
        expect(regionSum).toBeCloseTo(1, 12);
        const technology = values
          .filter(({ id }) => world.companies.find((c) => c.id === id)?.sectorId === 'technology')
          .reduce((sum, { value }) => sum + value / total, 0);
        const shownSector =
          composition?.sectors.find(({ key }) => key === 'technology')?.weight ?? 0;
        expect(shownSector).toBeCloseTo(technology, 12);
        const europe = values
          .filter(({ id }) => world.companies.find((c) => c.id === id)?.regionId === 'europe')
          .reduce((sum, { value }) => sum + value / total, 0);
        const shown = composition?.regions.find(({ key }) => key === 'europe')?.weight ?? 0;
        expect(shown).toBeCloseTo(europe, 12);
      }
    });

    it('weights by the last close before today, on the first day by the start prices', () => {
      const { indices } = engine.world.context;
      const x = indices.ids.indexOf(worldIndex.kind === 'index' ? worldIndex.indexId : '');
      for (const [now, price] of [
        [
          tick(2020, 6, 10, 12),
          (i: number) => engine.prices.priceAt(i, lateTick(dayOf(2020, 6, 9)), tick(2020, 6, 10)),
        ],
        [tick(2020, 1, 1, 12), (i: number) => engine.prices.priceAt(i, 0, 0)],
        [
          tick(2020, 1, 2, 12),
          (i: number) => engine.prices.priceAt(i, lateTick(0), tick(2020, 1, 2)),
        ],
      ] as const) {
        let total = 0;
        let largest = 0;
        for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
          const value = indices.shares[n] * price(indices.members[n]);
          total += value;
          largest = Math.max(largest, value);
        }
        expect(facts.composition(worldIndex, now)?.top[0].weight).toBeCloseTo(largest / total, 12);
      }
    });

    it('returns copies that callers may change', () => {
      const etf = byKind('etf').find(
        (instrument) => instrument.kind === 'etf' && instrument.distribution === 'distributing',
      ) as Instrument;
      const composition = facts.composition(etf, NOW);
      const before = structuredClone(composition);
      composition?.top.splice(0, 1);
      if (composition !== null) {
        composition.regions[0].weight = 0;
        composition.sectors[0].weight = 0;
      }
      expect(facts.composition(etf, NOW)).toEqual(before);
      const dividends = facts.dividends(etf, NOW);
      const copy = structuredClone(dividends);
      dividends.history[0].cents = 0;
      if (dividends.next !== null) {
        dividends.next.exDay = 0;
      }
      expect(facts.dividends(etf, NOW)).toEqual(copy);
    });

    it('has none for shares', () => {
      expect(facts.composition(byKind('stock')[0], NOW)).toBeNull();
    });
  });
});
