import { newestConsolidatedYear } from '@app/market/domain/candle-consolidation-logic';

import { CandleConsolidationResult, EngineStorage } from './engine-host.model';

/**
 * Background job of the worker host that consolidates old daily candles to weekly ones (TS §6.8):
 * a calendar year is due once all of it lies more than `dailyYears` game years back. One year at a
 * time, oldest first, each in one storage transaction; a year whose daily candles the candle job
 * still completes waits (`blocked`). Idempotent: consolidated years are known from the stored weekly
 * candles, and a year found incomplete or empty is not tried again in this load.
 */
export class CandleConsolidation {
  readonly #storage: EngineStorage;
  readonly #playerId: string;
  readonly #seriesIds: readonly string[];
  readonly #firstYear: number;
  readonly #dailyYears: number;
  /** Years consolidated, or found incomplete or without daily candles, in this load. */
  readonly #settled: Set<number>;
  #running = false;

  constructor(
    storage: EngineStorage,
    playerId: string,
    seriesIds: readonly string[],
    firstYear: number,
    dailyYears: number,
    consolidated: Iterable<number>,
  ) {
    this.#storage = storage;
    this.#playerId = playerId;
    this.#seriesIds = seriesIds;
    this.#firstYear = firstYear;
    this.#dailyYears = dailyYears;
    this.#settled = new Set(consolidated);
  }

  get running(): boolean {
    return this.#running;
  }

  /** Oldest year due on `day` that is neither settled nor `blocked`; `undefined` without one. */
  nextYear(day: number, blocked: (year: number) => boolean): number | undefined {
    const newest = newestConsolidatedYear(day, this.#dailyYears);
    for (let year = this.#firstYear; year <= newest; year++) {
      if (!this.#settled.has(year) && !blocked(year)) {
        return year;
      }
    }
    return undefined;
  }

  /**
   * Consolidates `year`. Whatever the storage answers, also a failure, the year is settled for this
   * load; the next load tries it again.
   */
  async run(year: number): Promise<CandleConsolidationResult> {
    this.#running = true;
    try {
      return await this.#storage.consolidateCandles(this.#playerId, this.#seriesIds, year);
    } finally {
      this.#settled.add(year);
      this.#running = false;
    }
  }
}
