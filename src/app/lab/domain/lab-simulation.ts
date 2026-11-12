import {
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
  weekdayOfDay,
} from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { weeklyCandles } from '@app/market/domain/candle-logic';
import { createCurveTables, SupportValues } from '@app/market/domain/day-curve';
import { createMarketContext } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { advanceMarket, createMarketState } from '@app/market/domain/market-step';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import { Prehistory, runPrehistory } from '@app/market/domain/prehistory';
import { PriceSource } from '@app/market/domain/price-source';
import { seriesIds, seriesRef } from '@app/market/domain/series';
import { deriveSeedKey, normalizeSeed, SeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { computeIntradayStatistics } from './intraday-statistics';
import {
  computeLabStatistics,
  longTermStatistics,
  phaseShares,
  worldReturnMeasures,
} from './lab-statistics';
import { sameDateLater } from './long-term-statistics';
import { collectMarketSample, MarketSampleCollector } from './market-sample';
import { CandleSource } from './models/candle-source.model';
import { LabStatistics, SeedRun, StatisticsStart } from './models/lab-statistics.model';
import { WorldOverview } from './models/world-overview.model';
import { worldOverview } from './world-overview.utils';

export interface SimulationStep {
  /** Calendar days advanced. */
  days: number;
  marketDays: number;
  now: Tick;
}

/**
 * The simulation of the lab (TS §14.2): world from a seed, prehistory up to the game start, then
 * day steps on request; candles of any series up to the current tick. Runs in the lab worker
 * (precursor of the engine worker, AP 2.2). Steps are separate methods so that the worker can
 * time them.
 */
export class LabSimulation {
  readonly seed: string;
  readonly world: World;
  readonly #seedKey: SeedKey;
  #market?: Prehistory;
  #priceSource?: PriceSource;

  constructor(seed: string) {
    this.seed = normalizeSeed(seed);
    this.#seedKey = deriveSeedKey(this.seed);
    this.world = generateWorld(this.#seedKey);
  }

  /** The current tick: the last minute of the last stepped day, so that every day is complete. */
  get now(): Tick {
    return dayStartTick(this.#requireMarket().state.day) - TICKS_PER_MINUTE;
  }

  overview(): WorldOverview {
    return worldOverview(this.world);
  }

  /** Runs the prehistory from the epoch to the game start; `now` is then the minute before it. */
  runPrehistory(): void {
    const market = runPrehistory(this.#seedKey, this.world);
    if (seriesIds(market.context).length !== this.overview().series.length) {
      throw new Error('LabSimulation: series of the market and the world overview differ');
    }
    this.#market = market;
    this.#priceSource = new PriceSource(market.context, market.history, market.state);
  }

  /** Steps `days` calendar days; weekends and holidays only move the day. */
  simulate(days: number): SimulationStep {
    if (!Number.isInteger(days) || days < 1) {
      throw new RangeError(`LabSimulation: invalid number of days ${days}`);
    }
    const { context, state, history } = this.#requireMarket();
    let marketDays = 0;
    advanceMarket(context, state, state.day + days, {
      history,
      onDay: () => marketDays++,
    });
    return { days, marketDays, now: this.now };
  }

  /**
   * Steps to the same calendar date `years` later (29 February becomes 1 March in years without
   * it).
   */
  simulateYears(years: number): SimulationStep {
    if (!Number.isInteger(years) || years < 1) {
      throw new RangeError(`LabSimulation: invalid number of years ${years}`);
    }
    const { state } = this.#requireMarket();
    return this.simulate(sameDateLater(state.day, years) - state.day);
  }

  /**
   * Statistics of the market days from the epoch or the game start up to the current day
   * (TS §14.2, measurement rules in TS §6.9). Recomputed from the month-start states; the
   * intraday part covers the last market days. `clock` (milliseconds) only times the minute
   * curves for the throughput.
   */
  statistics(start: StatisticsStart, clock: () => number = () => 0): LabStatistics {
    const { context, history, state } = this.#requireMarket();
    const fromDay = start === 'epoch' ? 0 : dayIndex(GAME_START_TICK);
    if (state.day - fromDay < 1) {
      throw new RangeError('LabSimulation: simulate past the start of the statistics first');
    }
    const tables = this.#requirePriceSource().tables;
    const sample = collectMarketSample(tables, history, this.world, fromDay, state.day);
    const intraday = computeIntradayStatistics(
      tables,
      history,
      this.world,
      fromDay,
      state.day,
      clock,
    );
    return computeLabStatistics(
      sample,
      intraday,
      this.world,
      start,
      context.config.tradingDaysPerYear,
    );
  }

  /**
   * Candles of a series in `[fromTick, toTick]`, never after `now`. `support` is only valid for
   * `1d` and `1w`, see `supportCandles`.
   */
  candles(
    series: number,
    resolution: CandleResolution,
    fromTick: Tick,
    toTick: Tick,
    source: CandleSource = 'minutes',
  ): Candle[] {
    if (source === 'support') {
      if (resolution !== '1d' && resolution !== '1w') {
        throw new RangeError(`LabSimulation: no support candles for ${resolution}`);
      }
      return this.supportCandles(series, resolution, fromTick, toTick);
    }
    return this.#requirePriceSource().candles(series, resolution, fromTick, toTick, this.now);
  }

  /**
   * Daily or weekly candles from the support points only, without minute bridges: one forward
   * pass over the days, so long periods of indices and ETFs stay fast. High and low are the range
   * of the daily opens and closes (the real values need the minute curves, TS §6.8).
   */
  supportCandles(series: number, resolution: '1d' | '1w', fromTick: Tick, toTick: Tick): Candle[] {
    const { context, history, state } = this.#requireMarket();
    const tables = this.#requirePriceSource().tables;
    const to = Math.min(toTick, this.now);
    if (to < fromTick) {
      return [];
    }
    let fromDay = Math.max(0, dayIndex(fromTick));
    if (resolution === '1w') {
      fromDay = Math.max(0, fromDay - weekdayOfDay(fromDay));
    }
    const toDay = Math.min(dayIndex(to) + 1, state.day);
    const stock = seriesRef(context, series).kind === 'stock' ? series : undefined;
    const daily: Candle[] = [];
    recomputeSupportDays(
      context,
      history,
      fromDay,
      toDay,
      (day) => {
        const support = new SupportValues(tables, day);
        const open = support.value(series, 'open');
        const close = support.value(series, 'close');
        daily.push({
          tick: dayStartTick(day.day),
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
        });
      },
      stock,
    );
    return resolution === '1w' ? weeklyCandles(daily) : daily;
  }

  /**
   * Long run of a seed for the seed comparison (TS §14.2): world, day steps from the epoch to the
   * same calendar date `years` after the game start, the sample collected while simulating (no
   * recomputation, no history). Gives the same long-term values as `statistics('epoch')` after
   * the same period.
   */
  static measureSeedRun(seed: string, years: number): SeedRun {
    if (!Number.isInteger(years) || years < 1) {
      throw new RangeError(`LabSimulation: invalid number of years ${years}`);
    }
    const normalized = normalizeSeed(seed);
    const seedKey = deriveSeedKey(normalized);
    const world = generateWorld(seedKey);
    const context = createMarketContext(seedKey, world);
    const state = createMarketState(context);
    const toDay = sameDateLater(dayIndex(GAME_START_TICK), years);
    const marketDaysPerYear = context.config.tradingDaysPerYear;
    const collector = new MarketSampleCollector(createCurveTables(context), world, 0, toDay, {
      stockReturns: false,
      marketDaysPerYear,
    });
    advanceMarket(context, state, toDay, { onDay: (day) => collector.add(day) });
    const sample = collector.finish();
    return {
      seed: normalized,
      years,
      marketDays: sample.days.length,
      phaseShares: phaseShares(sample.phases),
      ...worldReturnMeasures(sample, marketDaysPerYear),
      longTerm: longTermStatistics(sample, marketDaysPerYear),
    };
  }

  #requireMarket(): Prehistory {
    if (this.#market === undefined) {
      throw new Error('LabSimulation: run the prehistory first');
    }
    return this.#market;
  }

  #requirePriceSource(): PriceSource {
    if (this.#priceSource === undefined) {
      throw new Error('LabSimulation: run the prehistory first');
    }
    return this.#priceSource;
  }
}
