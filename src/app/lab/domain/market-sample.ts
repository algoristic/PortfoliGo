import { annualizedVolatility, logReturns, median } from '@app/analysis/domain/statistics-logic';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { CurveTables, SupportValues } from '@app/market/domain/day-curve';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { phaseIndex } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { MarketDay } from '@app/market/domain/models/market-day.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { indexSeries, totalReturnSeries } from '@app/market/domain/series';
import { World } from '@app/world/domain/models/world.model';

import { CHECKPOINT_YEARS, checkpointDay } from './long-term-statistics';
import {
  LongTermCheckpoint,
  SIZE_CLASS_SHARES_KEYS,
  SizeClassSharesKey,
} from './models/lab-statistics.model';

const CENTS_PER_EURO = 100;
const TOP_CONSTITUENTS = 5;
const ONE_EURO = 1;

/** Overnight share of the daily variance, `Var(ln open / prev close) ÷ Var(ln close / prev close)`. */
export interface OvernightShares {
  world: number;
  /** Median over the broad regional indices. */
  regions: number;
  /** Median over the shares. */
  stocks: number;
}

/** Daily closes and returns of a period, collected in one pass over the support points. */
export interface MarketSample {
  /** Market days of the period (day indices since the epoch). */
  days: Int32Array;
  /** Phase index per market day (`phaseIndex`). */
  phases: Uint8Array;
  /** Closes of the world price index and the world total return index per market day. */
  worldPrice: Float64Array;
  worldTotalReturn: Float64Array;
  /** Per share: log returns from close to close, one fewer than market days; empty without shares. */
  stockReturns: Float32Array[];
  /** Per share: sum of the ex-dividend amounts in euros and of the closes. */
  dividendSum: Float64Array;
  closeSum: Float64Array;
  overnight: OvernightShares;
  /** One entry per `CHECKPOINT_YEARS`; those outside the period are not measurable. */
  checkpoints: LongTermCheckpoint[];
}

export interface MarketSampleOptions {
  /** Keep the daily returns per share (correlations, volatility per share); default true. */
  stockReturns?: boolean;
  /** Market days per year for the trailing index volatility of the checkpoints. */
  marketDaysPerYear: number;
}

/** Running sums of the overnight and the close-to-close log returns of `count` series. */
class OvernightSums {
  readonly #onSum: Float64Array;
  readonly #onSquares: Float64Array;
  readonly #dailySum: Float64Array;
  readonly #dailySquares: Float64Array;
  #count = 0;

  constructor(count: number) {
    this.#onSum = new Float64Array(count);
    this.#onSquares = new Float64Array(count);
    this.#dailySum = new Float64Array(count);
    this.#dailySquares = new Float64Array(count);
  }

  add(k: number, previousClose: number, open: number, close: number): void {
    const overnight = Math.log(open / previousClose);
    const daily = Math.log(close / previousClose);
    this.#onSum[k] += overnight;
    this.#onSquares[k] += overnight * overnight;
    this.#dailySum[k] += daily;
    this.#dailySquares[k] += daily * daily;
  }

  /** Called once per day after all `add`s of the day. */
  nextDay(): void {
    this.#count++;
  }

  share(k: number): number {
    const n = this.#count;
    if (n < 2) {
      return Number.NaN;
    }
    const overnight = this.#onSquares[k] - (this.#onSum[k] * this.#onSum[k]) / n;
    const daily = this.#dailySquares[k] - (this.#dailySum[k] * this.#dailySum[k]) / n;
    return daily > 0 ? overnight / daily : Number.NaN;
  }
}

interface CheckpointRecord {
  years: number;
  day: number;
  /** Position of the day in the sample. */
  position: number;
  values?: Omit<LongTermCheckpoint, 'years' | 'tick' | 'indexVolatility'>;
}

/**
 * Collects a `MarketSample` day by day, either from recomputed days (`collectMarketSample`) or
 * while simulating (`advanceMarket` with `onDay`). The days must be the market days of
 * `[fromDay, toDay)` in order. Lab code: returns use `Math.log`, the sample never feeds back into
 * the simulation.
 */
export class MarketSampleCollector {
  readonly #tables: CurveTables;
  readonly #world: World;
  readonly #marketDaysPerYear: number;
  readonly #shareCount: number;
  readonly #priceSeries: number;
  readonly #totalReturnSeries: number;
  readonly #worldIndex: number;
  readonly #regionSeries: number[];
  readonly #days: Int32Array;
  readonly #phases: Uint8Array;
  readonly #worldPrice: Float64Array;
  readonly #worldTotalReturn: Float64Array;
  readonly #stockReturns: Float32Array[];
  readonly #dividendSum: Float64Array;
  readonly #closeSum: Float64Array;
  readonly #closes: Float64Array;
  readonly #previousCloses: Float64Array;
  readonly #previousIndexCloses: Float64Array;
  readonly #stockOvernight: OvernightSums;
  readonly #indexOvernight: OvernightSums;
  readonly #checkpoints: CheckpointRecord[];
  #n = 0;

  constructor(
    tables: CurveTables,
    world: World,
    fromDay: number,
    toDay: number,
    options: MarketSampleOptions,
  ) {
    const { context } = tables;
    this.#tables = tables;
    this.#world = world;
    this.#marketDaysPerYear = options.marketDaysPerYear;
    this.#shareCount = context.layout.instrumentIds.length;
    this.#worldIndex = world.indices.findIndex((index) => index.kind === 'world');
    if (this.#worldIndex < 0) {
      throw new Error('MarketSampleCollector: the world has no world index');
    }
    this.#priceSeries = indexSeries(context, this.#worldIndex);
    this.#totalReturnSeries = totalReturnSeries(context, this.#worldIndex);
    this.#regionSeries = world.indices.flatMap((index, x) =>
      index.kind === 'region-broad' ? [indexSeries(context, x)] : [],
    );

    let marketDays = 0;
    for (let d = fromDay; d < toDay; d++) {
      if (isMarketDay(d)) {
        marketDays++;
      }
    }
    this.#days = new Int32Array(marketDays);
    this.#phases = new Uint8Array(marketDays);
    this.#worldPrice = new Float64Array(marketDays);
    this.#worldTotalReturn = new Float64Array(marketDays);
    this.#stockReturns =
      options.stockReturns === false
        ? []
        : Array.from(
            { length: this.#shareCount },
            () => new Float32Array(Math.max(0, marketDays - 1)),
          );
    this.#dividendSum = new Float64Array(this.#shareCount);
    this.#closeSum = new Float64Array(this.#shareCount);
    this.#closes = new Float64Array(this.#shareCount);
    this.#previousCloses = new Float64Array(this.#shareCount);
    this.#previousIndexCloses = new Float64Array(this.#regionSeries.length + 1);
    this.#stockOvernight = new OvernightSums(this.#shareCount);
    this.#indexOvernight = new OvernightSums(this.#regionSeries.length + 1);
    this.#checkpoints = CHECKPOINT_YEARS.map((years) => ({
      years,
      day: checkpointDay(years),
      position: -1,
    }));
  }

  add(day: Readonly<MarketDay>): void {
    const n = this.#n;
    if (n >= this.#days.length) {
      throw new Error(`MarketSampleCollector: more market days than expected (${n + 1})`);
    }
    const support = new SupportValues(this.#tables, day);
    for (let i = 0; i < this.#shareCount; i++) {
      const close = support.value(i, 'close');
      if (n > 0) {
        if (this.#stockReturns.length > 0) {
          this.#stockReturns[i][n - 1] = Math.log(close / this.#previousCloses[i]);
        }
        this.#stockOvernight.add(i, this.#previousCloses[i], support.value(i, 'open'), close);
      }
      this.#closes[i] = close;
      this.#closeSum[i] += close;
      this.#dividendSum[i] += day.exDividendCents[i] / CENTS_PER_EURO;
    }
    [this.#priceSeries, ...this.#regionSeries].forEach((series, k) => {
      const close = support.value(series, 'close');
      if (n > 0) {
        this.#indexOvernight.add(
          k,
          this.#previousIndexCloses[k],
          support.value(series, 'open'),
          close,
        );
      }
      this.#previousIndexCloses[k] = close;
    });
    if (n > 0) {
      this.#stockOvernight.nextDay();
      this.#indexOvernight.nextDay();
    }
    this.#previousCloses.set(this.#closes);

    this.#days[n] = day.day;
    this.#phases[n] = phaseIndex(day.phase);
    this.#worldPrice[n] = support.value(this.#priceSeries, 'close');
    this.#worldTotalReturn[n] = support.value(this.#totalReturnSeries, 'close');
    for (const checkpoint of this.#checkpoints) {
      if (checkpoint.day === day.day) {
        checkpoint.position = n;
        checkpoint.values = this.#checkpointValues();
      }
    }
    this.#n++;
  }

  finish(): MarketSample {
    if (this.#n !== this.#days.length) {
      throw new Error(
        `MarketSampleCollector: expected ${this.#days.length} market days, got ${this.#n}`,
      );
    }
    return {
      days: this.#days,
      phases: this.#phases,
      worldPrice: this.#worldPrice,
      worldTotalReturn: this.#worldTotalReturn,
      stockReturns: this.#stockReturns,
      dividendSum: this.#dividendSum,
      closeSum: this.#closeSum,
      overnight: {
        world: this.#indexOvernight.share(0),
        regions: median(this.#regionSeries.map((_, r) => this.#indexOvernight.share(r + 1))),
        stocks: median(
          Array.from({ length: this.#shareCount }, (_, i) => this.#stockOvernight.share(i)),
        ),
      },
      checkpoints: this.#checkpoints.map((checkpoint) => this.#checkpoint(checkpoint)),
    };
  }

  #checkpointValues(): CheckpointRecord['values'] {
    const { indices, config } = this.#tables.context;
    const weights: number[] = [];
    for (
      let m = indices.memberStart[this.#worldIndex];
      m < indices.memberStart[this.#worldIndex + 1];
      m++
    ) {
      weights.push(indices.shares[m] * this.#closes[indices.members[m]]);
    }
    weights.sort((a, b) => b - a);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const top = weights.slice(0, TOP_CONSTITUENTS).reduce((sum, weight) => sum + weight, 0);

    const below: Record<SizeClassSharesKey, number> = { large: 0, mid: 0, small: 0, all: 0 };
    const counts: Record<SizeClassSharesKey, number> = { large: 0, mid: 0, small: 0, all: 0 };
    let atFloor = 0;
    let maxPrice = 0;
    this.#world.companies.forEach((company, i) => {
      const close = this.#closes[i];
      counts[company.size]++;
      counts.all++;
      if (close < ONE_EURO) {
        below[company.size]++;
        below.all++;
      }
      if (close <= config.priceFloor) {
        atFloor++;
      }
      maxPrice = Math.max(maxPrice, close);
    });
    const belowOneEuro = { ...below };
    for (const key of SIZE_CLASS_SHARES_KEYS) {
      belowOneEuro[key] = counts[key] > 0 ? below[key] / counts[key] : Number.NaN;
    }
    return {
      topFiveShare: top / total,
      belowOneEuro,
      atFloor: atFloor / this.#shareCount,
      maxPrice,
    };
  }

  #checkpoint({ years, day, position, values }: CheckpointRecord): LongTermCheckpoint {
    if (values === undefined) {
      return {
        years,
        tick: null,
        topFiveShare: Number.NaN,
        belowOneEuro: { large: Number.NaN, mid: Number.NaN, small: Number.NaN, all: Number.NaN },
        atFloor: Number.NaN,
        maxPrice: Number.NaN,
        indexVolatility: Number.NaN,
      };
    }
    return {
      years,
      tick: dayStartTick(day),
      ...values,
      indexVolatility: this.#trailingVolatility(position),
    };
  }

  /** Volatility of the world price index over the `marketDaysPerYear` returns up to `position`. */
  #trailingVolatility(position: number): number {
    const returns = this.#marketDaysPerYear;
    if (position < returns) {
      return Number.NaN;
    }
    const closes = this.#worldPrice.subarray(position - returns, position + 1);
    return annualizedVolatility(logReturns(closes), this.#marketDaysPerYear);
  }
}

/**
 * Collects the sample for the market days in `[fromDay, toDay)` from the month-start states
 * (`recomputeSupportDays`), without minute bridges.
 */
export function collectMarketSample(
  tables: CurveTables,
  history: FactorHistory,
  world: World,
  fromDay: number,
  toDay: number,
  marketDaysPerYear = tables.context.config.tradingDaysPerYear,
): MarketSample {
  const collector = new MarketSampleCollector(tables, world, fromDay, toDay, {
    marketDaysPerYear,
  });
  recomputeSupportDays(tables.context, history, fromDay, toDay, (day) => collector.add(day));
  return collector.finish();
}
