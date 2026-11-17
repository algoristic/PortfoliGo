import { annualizedVolatility, logReturns, median } from '@app/analysis/domain/statistics-logic';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { CurveTables, SupportValues } from '@app/market/domain/day-curve';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { phaseIndex } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { MarketDay } from '@app/market/domain/models/market-day.model';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { indexSeries, totalReturnSeries } from '@app/market/domain/series';
import { REGION_IDS, RegionId } from '@app/world/domain/models/taxonomy.model';
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
  /** Per broad regional index; `NaN` for a region without one. */
  regions: Readonly<Record<RegionId, number>>;
  /** Median over the shares. */
  stocks: number;
}

/** Daily closes of a broad regional price index. */
export interface RegionCloses {
  regionId: RegionId;
  closes: Float64Array;
}

/**
 * State of all shares at one yearly rebalancing date (every `marketDaysPerYear`-th market day from
 * the first) for the premium measures of TS §6.9 (AP 7.3a).
 */
export interface YearlyShareState {
  /** Position of the market day in the sample. */
  position: number;
  /** Per share: cumulative log total return `Σ ln((close + dividend) / previous close)` so far. */
  logTotalReturn: Float64Array;
  /** Per share: close ÷ highest close of the period so far (1 at a new high). */
  highRatio: Float64Array;
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
  /** Closes of the broad regional price indices, in the order of the world's indices. */
  regionPrices: RegionCloses[];
  /** One entry per rebalancing date, the first at the first market day. */
  yearly: YearlyShareState[];
  /** Highest close of a share in the period. */
  maxPrice: number;
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
  /** Region of each entry of `#regionSeries`. */
  readonly #regionIds: (RegionId | null)[];
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
  readonly #regionPrices: Float64Array[];
  readonly #logTotalReturn: Float64Array;
  readonly #highs: Float64Array;
  readonly #yearly: YearlyShareState[] = [];
  #maxPrice = 0;
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
    this.#regionIds = world.indices.flatMap((index) =>
      index.kind === 'region-broad' ? [index.regionId] : [],
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
    this.#regionPrices = this.#regionSeries.map(() => new Float64Array(marketDays));
    this.#logTotalReturn = new Float64Array(this.#shareCount);
    this.#highs = new Float64Array(this.#shareCount);
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
        const dividend = day.exDividendCents[i] / CENTS_PER_EURO;
        this.#logTotalReturn[i] += Math.log((close + dividend) / this.#previousCloses[i]);
      }
      this.#highs[i] = n === 0 ? close : Math.max(this.#highs[i], close);
      this.#maxPrice = Math.max(this.#maxPrice, close);
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
      if (k > 0) {
        this.#regionPrices[k - 1][n] = close;
      }
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
    if (n % this.#marketDaysPerYear === 0) {
      this.#yearly.push({
        position: n,
        logTotalReturn: this.#logTotalReturn.slice(),
        highRatio: this.#closes.map((close, i) => close / this.#highs[i]),
      });
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
        regions: Object.fromEntries(
          REGION_IDS.map((region) => {
            const r = this.#regionIds.indexOf(region);
            return [region, r < 0 ? Number.NaN : this.#indexOvernight.share(r + 1)];
          }),
        ) as Record<RegionId, number>,
        stocks: median(
          Array.from({ length: this.#shareCount }, (_, i) => this.#stockOvernight.share(i)),
        ),
      },
      checkpoints: this.#checkpoints.map((checkpoint) => this.#checkpoint(checkpoint)),
      regionPrices: this.#regionPrices.map((closes, k) => ({
        regionId: this.#regionIds[k] as RegionId,
        closes,
      })),
      yearly: this.#yearly,
      maxPrice: this.#maxPrice,
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
