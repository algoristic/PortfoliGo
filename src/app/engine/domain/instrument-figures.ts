import { dayIndex, minuteOfDay } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { DailyCloses } from '@app/market/domain/daily-closes';
import { CurveTables } from '@app/market/domain/day-curve';
import { announcementDay, exDayOnOrAfter, paymentDay } from '@app/market/domain/dividend-logic';
import {
  CompositionMember,
  dividendHistory,
  dividendHistoryStart,
  figureWindowDays,
  indexComposition,
  scheduledExDays,
  windowBeta,
  windowVolatility,
} from '@app/market/domain/instrument-figures-logic';
import { MarketContext } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import {
  FIGURE_PERIODS,
  FigurePeriod,
  IndexComposition,
  InstrumentDividends,
  InstrumentFigures,
  UpcomingDividend,
} from '@app/market/domain/models/instrument-figures.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { MarketDay } from '@app/market/domain/models/market-day.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import {
  marketDayOnOrBefore,
  PERFORMANCE_MONTHS,
  performanceReferenceDay,
  relativeChange,
  trailingDividendDays,
} from '@app/market/domain/performance-logic';
import { priceFromLog } from '@app/market/domain/price-logic';
import { etfSeries, indexSeries, seriesRef } from '@app/market/domain/series';
import { Company } from '@app/world/domain/models/company.model';
import { World } from '@app/world/domain/models/world.model';

import { trailingDividendYield } from './market-screen';
import { PricePort } from './models/price-port.model';
import { seriesSession } from './series-quote';

export interface InstrumentFactSources {
  world: World;
  context: MarketContext;
  /** Master data of all series in series order (`instrumentCatalog`). */
  catalog: readonly Instrument[];
  prices: PricePort;
  history: FactorHistory;
  tables: CurveTables;
  /** Indicative value of a series at `now` (`PriceSource.indicativeAt`), `null` without curves. */
  indicative: ((series: number, now: Tick) => number) | null;
}

const NO_DIVIDENDS: InstrumentDividends = { history: [], next: null };

/**
 * Key figures, dividends and index compositions of the instrument page (TS §8.2, AP 4.5, US-MK-03).
 * Everything comes from the support points, never from minute curves (except the indicative value
 * at `now`), and ends at `now` (TS §4.5, rule 7). Closes of the figure window live in an own
 * `DailyCloses`, which moves on by one day step per market day; dividends and compositions are
 * cached for the current day.
 */
export class InstrumentFacts {
  readonly #sources: InstrumentFactSources;
  /** Closes of shares and indices; ETF closes are costly and kept apart, from the first ETF on. */
  readonly #closes: DailyCloses;
  #etfCloses: DailyCloses | null = null;
  readonly #companies: ReadonlyMap<string, Company>;
  /** Series of the world price index, the benchmark of beta; `null` without one. */
  readonly #benchmark: number | null;
  #cacheDay = Number.NaN;
  readonly #dividends = new Map<string, InstrumentDividends>();
  readonly #compositions = new Map<number, IndexComposition>();

  constructor(sources: InstrumentFactSources) {
    this.#sources = sources;
    this.#closes = new DailyCloses(
      sources.context,
      sources.history,
      sources.tables,
      etfSeries(sources.context, 0),
    );
    this.#companies = new Map(sources.world.companies.map((company) => [company.id, company]));
    const world = sources.world.indices.findIndex(({ kind }) => kind === 'world');
    const x = world < 0 ? -1 : sources.context.indices.ids.indexOf(sources.world.indices[world].id);
    this.#benchmark = x < 0 ? null : indexSeries(sources.context, x);
  }

  /** Key figures of `instrument` at `now`. */
  figures(instrument: Instrument, now: Tick): InstrumentFigures {
    const { context, prices, indicative } = this.#sources;
    const { series } = instrument;
    const today = dayIndex(now);
    const closes = instrument.kind === 'etf' ? this.#etfDailyCloses() : this.#closes;
    const { window, referenceDays, dividendDays } = this.#prepare(closes, today);
    const last = prices.priceAt(series, now, now);
    const performance = {} as Record<FigurePeriod, number | null>;
    FIGURE_PERIODS.forEach((period, p) => {
      const day = referenceDays[p];
      performance[period] = day === null ? null : relativeChange(last, closes.close(series, day));
    });
    let volatility: number | null = null;
    let beta: number | null = null;
    if (window !== null) {
      const values = window.map((day) => closes.close(series, day));
      volatility = windowVolatility(values);
      if (this.#benchmark !== null) {
        const benchmark = this.#benchmark;
        beta = windowBeta(
          values,
          window.map((day) => closes.close(benchmark, day)),
        );
      }
    }
    const company = instrument.kind === 'stock' ? this.#companies.get(instrument.id) : undefined;
    return {
      id: instrument.id,
      series,
      last,
      indicativeValue: indicative === null ? null : indicative(series, now),
      marketCap: company === undefined ? null : company.sharesOutstanding * last,
      dividendYield: trailingDividendYield(context, closes, instrument, dividendDays, now, last),
      volatility,
      beta,
      performance,
    };
  }

  /**
   * Dividend history (ex-dates of the last five years up to now, newest first) and the next ex-date
   * of a share or distributing ETF (TS §6.5). Today's ex-date belongs to the history from the open
   * of the series, before it is the next date. The amount of the next date only once announced.
   */
  dividends(instrument: Instrument, now: Tick): InstrumentDividends {
    const { context } = this.#sources;
    const today = dayIndex(now);
    this.#moveCacheTo(today);
    const opened = minuteOfDay(now) >= seriesSession(context, instrument.series).open;
    const key = `${instrument.series}:${opened}`;
    let result = this.#dividends.get(key);
    if (result === undefined) {
      result = this.#computeDividends(instrument, today, opened);
      this.#dividends.set(key, result);
    }
    return copyDividends(result);
  }

  /**
   * Composition of an index or of the index an ETF tracks at the close of the last market day
   * before today; `null` for shares.
   */
  composition(instrument: Instrument, now: Tick): IndexComposition | null {
    if (instrument.kind === 'stock') {
      return null;
    }
    const { context } = this.#sources;
    const today = dayIndex(now);
    const x = context.indices.ids.indexOf(instrument.indexId);
    this.#moveCacheTo(today);
    let result = this.#compositions.get(x);
    if (result === undefined) {
      this.#prepare(this.#closes, today);
      result = this.#computeComposition(x, marketDayOnOrBefore(today - 1));
      this.#compositions.set(x, result);
    }
    return copyComposition(result);
  }

  /** Prepares the closes and dividends of every figure of `today` in one request. */
  #prepare(
    closes: DailyCloses,
    today: number,
  ): {
    window: number[] | null;
    referenceDays: (number | null)[];
    dividendDays: number[];
  } {
    const window = figureWindowDays(today);
    const referenceDays = FIGURE_PERIODS.map((period) =>
      performanceReferenceDay(today, PERFORMANCE_MONTHS[period]),
    );
    const dividendDays = trailingDividendDays(today);
    const lastClose = marketDayOnOrBefore(today - 1);
    const closeDays = [
      ...(window ?? []),
      ...referenceDays.filter((day): day is number => day !== null),
      ...(lastClose >= 0 ? [lastClose] : []),
    ];
    closes.prepare(closeDays, dividendDays);
    return { window, referenceDays, dividendDays };
  }

  #etfDailyCloses(): DailyCloses {
    const { context, history, tables } = this.#sources;
    this.#etfCloses ??= new DailyCloses(context, history, tables);
    return this.#etfCloses;
  }

  #moveCacheTo(today: number): void {
    if (today !== this.#cacheDay) {
      this.#cacheDay = today;
      this.#dividends.clear();
      this.#compositions.clear();
    }
  }

  #computeDividends(instrument: Instrument, today: number, opened: boolean): InstrumentDividends {
    const { context } = this.#sources;
    const { kind, index } = seriesRef(context, instrument.series);
    const fromDay = dividendHistoryStart(today);
    // Today's ex-date is paid from the open of the series on (TS §6.5).
    const nextFrom = opened ? today + 1 : today;
    if (kind === 'stock') {
      const dividend = context.layout.dividends[index];
      if (dividend === null) {
        return NO_DIVIDENDS;
      }
      const { schedule, frequency, startDay } = dividend;
      const exDays = scheduledExDays(schedule, frequency, Math.max(fromDay, startDay), today);
      const cents = this.#exDividends(exDays, index, (day) => day.exDividendCents[index]);
      const nextDay = exDayOnOrAfter(schedule, frequency, Math.max(startDay, nextFrom));
      let next: UpcomingDividend | null = null;
      if (nextDay === today) {
        next = { exDay: nextDay, paymentDay: paymentDay(nextDay), cents: cents.get(today) ?? null };
      } else {
        const announced =
          announcementDay(nextDay) <= today ? this.#announced(index, nextDay, today) : null;
        if (announced !== null || startDay <= today) {
          next = { exDay: nextDay, paymentDay: paymentDay(nextDay), cents: announced };
        }
      }
      return {
        history: payments(exDays, cents, nextFrom),
        next,
      };
    }
    if (kind !== 'etf') {
      return NO_DIVIDENDS;
    }
    const terms = context.etfs.distributions[index];
    if (terms === null) {
      return NO_DIVIDENDS;
    }
    const { schedule, frequency } = terms;
    const exDays = scheduledExDays(schedule, frequency, fromDay, today);
    const cents = this.#exDividends(exDays, undefined, (day) => day.etfExCents[index]);
    // The distribution is the pot at the ex-date's open; it is never announced in advance.
    const nextDay = exDayOnOrAfter(schedule, frequency, nextFrom);
    return {
      history: payments(exDays, cents, nextFrom),
      next: { exDay: nextDay, paymentDay: paymentDay(nextDay), cents: null },
    };
  }

  /**
   * Amounts on the ex-dates `days` (none after today), each recomputed from its month start (at most
   * one month of day steps), only share `instrument` if given, else the whole market.
   */
  #exDividends(
    days: readonly number[],
    instrument: number | undefined,
    read: (day: Readonly<MarketDay>) => number,
  ): Map<number, number> {
    const { context, history } = this.#sources;
    const result = new Map<number, number>();
    for (const exDay of days) {
      recomputeSupportDays(
        context,
        history,
        exDay,
        exDay + 1,
        (day) => result.set(day.day, read(day)),
        instrument,
      );
    }
    return result;
  }

  /**
   * Dividend of share i announced for the ex-date `exDay`, as the state after the step of the last
   * market day up to today holds it; `null` before the announcement.
   */
  #announced(i: number, exDay: number, today: number): number | null {
    const { context, history } = this.#sources;
    const day = marketDayOnOrBefore(today);
    let cents: number | null = null;
    recomputeSupportDays(
      context,
      history,
      day,
      day + 1,
      (_day, state) => {
        const value = state.dividendCents[i];
        cents = state.nextExDay[i] !== exDay || Number.isNaN(value) ? null : value;
      },
      i,
    );
    return cents;
  }

  #computeComposition(x: number, closeDay: number): IndexComposition {
    const { context, catalog } = this.#sources;
    const { indices, layout, config } = context;
    const members: CompositionMember[] = [];
    for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
      const i = indices.members[n];
      const company = this.#companies.get(layout.instrumentIds[i]);
      if (company === undefined) {
        throw new Error(`InstrumentFacts: constituent ${layout.instrumentIds[i]} unknown`);
      }
      const price =
        closeDay < 0
          ? priceFromLog(layout.logBase[i], config.priceFloor)
          : this.#closes.close(i, closeDay);
      members.push({
        id: company.id,
        series: i,
        name: catalog[i].name,
        regionId: company.regionId,
        sectorId: company.sectorId,
        value: indices.shares[n] * price,
      });
    }
    return indexComposition(indices.ids[x], members);
  }
}

function payments(
  exDays: readonly number[],
  cents: ReadonlyMap<number, number>,
  nextFrom: number,
): InstrumentDividends['history'] {
  return dividendHistory(
    exDays
      .filter((day) => day < nextFrom)
      .map((exDay) => ({ exDay, paymentDay: paymentDay(exDay), cents: cents.get(exDay) ?? 0 })),
  );
}

function copyDividends(dividends: InstrumentDividends): InstrumentDividends {
  return {
    history: dividends.history.map((payment) => ({ ...payment })),
    next: dividends.next === null ? null : { ...dividends.next },
  };
}

function copyComposition(composition: IndexComposition): IndexComposition {
  return {
    ...composition,
    top: composition.top.map((position) => ({ ...position })),
    regions: composition.regions.map((share) => ({ ...share })),
    sectors: composition.sectors.map((share) => ({ ...share })),
  };
}
