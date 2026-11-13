import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { PricePortFactory, priceSourcePort } from '@app/engine/domain/game-engine';
import { GameWorld } from '@app/engine/domain/models/game-world.model';
import { PricePort } from '@app/engine/domain/models/price-port.model';
import { createCurveTables, CurveTables, SupportValues } from '@app/market/domain/day-curve';
import { MarketContext } from '@app/market/domain/market-context';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { copyMarketDay } from '@app/market/domain/market-step';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { PriceSource } from '@app/market/domain/price-source';
import { seriesIds } from '@app/market/domain/series';

import { DailyCandlePatch } from './engine-host.model';

/** Daily candles of the series that closed in one session. */
export interface ClosedCandles {
  patches: DailyCandlePatch[];
  /** `false` when only open and close are known; the background job adds high and low. */
  complete: boolean;
}

/**
 * Daily candles at the session close (TS §6.8) for the worker host. It wraps the price port of the
 * engine: live at moderate speeds, high and low come from the minute curves of the `PriceSource`;
 * in batch mode and at fast live speeds, open and close come from the support points
 * (`SupportValues`, bit for bit the ends of the minute curves), which the port keeps for every
 * stepped day while `keepSupport` is set. It also hands the factor history to the background job.
 */
export class DailyCandleSource {
  readonly context: MarketContext;
  /** Stable series IDs (`seriesIds`) by series index. */
  readonly ids: readonly string[];
  /** Set by the host while days close without high and low (batch runs, fast live speeds). */
  keepSupport = false;
  readonly #inner: PricePortFactory;
  readonly #support = new Map<number, SupportValues>();
  #port?: PricePort;
  #history?: FactorHistory;
  #tables?: CurveTables;

  constructor(world: GameWorld, inner: PricePortFactory = priceSourcePort) {
    this.context = world.context;
    this.ids = seriesIds(world.context);
    this.#inner = inner;
  }

  /** Price port factory for the engine; call it once. */
  readonly prices: PricePortFactory = (world, history, market) => {
    const port = this.#inner(world, history, market);
    this.#port = port;
    this.#history = history;
    return {
      priceAt: (series, tick, now) => port.priceAt(series, tick, now),
      quoteAt: (series, tick, now, venueMarkup) => port.quoteAt(series, tick, now, venueMarkup),
      rememberDay: (day) => {
        port.rememberDay(day);
        if (this.keepSupport) {
          this.#support.set(day.day, new SupportValues(this.tables, copyMarketDay(day)));
        }
      },
    };
  };

  /** Factor history of the engine; it grows in place. */
  get history(): FactorHistory {
    if (this.#history === undefined) {
      throw new Error('DailyCandleSource: the engine has not been created yet');
    }
    return this.#history;
  }

  /** The engine's price source with minute curves; `null` for other ports (test market). */
  get priceSource(): PriceSource | null {
    return this.#port instanceof PriceSource ? this.#port : null;
  }

  get tables(): CurveTables {
    if (this.#port instanceof PriceSource) {
      return this.#port.tables;
    }
    this.#tables ??= createCurveTables(this.context);
    return this.#tables;
  }

  /**
   * Candles of `series` whose trading day `day` ended, at the current tick `now`: complete when
   * `highLow` is asked for and the port has minute curves, else open and close only.
   */
  closed(series: readonly number[], day: number, now: Tick, highLow: boolean): ClosedCandles {
    const port = this.#port;
    // Days before this one are closed for every series; their support points are no longer needed.
    for (const kept of this.#support.keys()) {
      if (kept < day) {
        this.#support.delete(kept);
      }
    }
    if (highLow && port instanceof PriceSource) {
      const start = dayStartTick(day);
      const patches = series.map((s) => {
        const [candle] = port.candles(s, '1d', start, start, now);
        return { seriesId: this.ids[s], day, ...candle };
      });
      return { patches, complete: true };
    }
    const support = this.#supportOf(day);
    const patches = series.map((s) => ({
      seriesId: this.ids[s],
      day,
      open: support.value(s, 'open'),
      high: Number.NaN,
      low: Number.NaN,
      close: support.value(s, 'close'),
    }));
    return { patches, complete: false };
  }

  /** Support points of a day: kept while stepping, else recomputed from its month start. */
  #supportOf(day: number): SupportValues {
    let support = this.#support.get(day);
    if (support === undefined) {
      recomputeSupportDays(this.context, this.history, day, day + 1, (recomputed) => {
        support = new SupportValues(this.tables, copyMarketDay(recomputed));
      });
      if (support === undefined) {
        throw new RangeError(`DailyCandleSource: day ${day} is not a market day`);
      }
      this.#support.set(day, support);
    }
    return support;
  }
}
