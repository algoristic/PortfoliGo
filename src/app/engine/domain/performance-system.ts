import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dayIndex } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { totalReturnSeries } from '@app/market/domain/series';
import {
  DailyPoint,
  PerformanceFigures,
  PortfolioValues,
} from '@app/portfolio/domain/models/performance.model';
import {
  addFlow,
  closeDay,
  externalFlow,
  investAtClose,
  performanceFigures,
} from '@app/portfolio/domain/performance-logic';
import { Cents } from '@app/shared/domain/models/money.model';

import { PlayerState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { PricePort } from './models/price-port.model';

/** The series the benchmark buys and the exchange (world order) with whose session it closes. */
export interface BenchmarkSeries {
  series: number;
  exchange: number;
}

/**
 * The world performance index (TS §5.5, §7.9) and its closing exchange; `null` in a world without
 * a world index.
 */
export function benchmarkSeries(world: GameWorld): BenchmarkSeries | null {
  const { context, exchanges } = world;
  const index = world.world.indices.find(({ kind }) => kind === 'world');
  const x = index === undefined ? -1 : context.indices.ids.indexOf(index.id);
  if (x < 0) {
    return null;
  }
  const series = totalReturnSeries(context, x);
  const exchange = exchanges.findIndex(({ closingSeries }) => closingSeries.includes(series));
  return exchange < 0 ? null : { series, exchange };
}

/**
 * Daily series, time-weighted return and benchmark (TS §3.8 step 4, §7.9) on
 * `PlayerState.performance`: external flows from the booked transactions, the benchmark's
 * purchases at the closes of the world performance index, and the day ends at the day change.
 * The points of the days that ended wait in a buffer for the host (`drainPoints`).
 */
export class PerformanceSystem {
  readonly benchmark: BenchmarkSeries | null;
  readonly #player: PlayerState;
  readonly #prices: PricePort;
  #points: DailyPoint[] = [];

  constructor(world: GameWorld, player: PlayerState, prices: PricePort) {
    this.benchmark = benchmarkSeries(world);
    this.#player = player;
    this.#prices = prices;
  }

  /** Adds the external flow of a booked transaction to the running day. */
  booked(transaction: Transaction): void {
    const flow = externalFlow(transaction.postings);
    if (flow !== 0) {
      this.#player.performance = addFlow(this.#player.performance, flow);
    }
  }

  /** A session closed: at the close of the world index the benchmark invests its waiting flows. */
  sessionClosed(exchange: number, tick: Tick): void {
    const { performance } = this.#player;
    if (this.benchmark === null || exchange !== this.benchmark.exchange) {
      return;
    }
    if (performance.benchmark === null) {
      return;
    }
    const close = this.#prices.priceAt(this.benchmark.series, tick, tick);
    this.#player.performance = {
      ...performance,
      benchmark: investAtClose(performance.benchmark, close),
    };
  }

  /**
   * Day change at `tick` (00:00): ends the running day with the balances now and the securities
   * at its last minute (`securitiesAt`), before anything is booked on the new day.
   */
  dayChanged(tick: Tick, securitiesAt: (endOfDay: Tick) => Cents): void {
    const day = dayIndex(tick);
    while (this.#player.performance.day < day) {
      const closed = closeDay(this.#player.performance, {
        cash: this.#cash(),
        securities: securitiesAt(tick - TICKS_PER_MINUTE),
      });
      this.#player.performance = closed.state;
      this.#points.push(closed.point);
    }
  }

  /** Points of the days that ended since the last call, ascending; empties the buffer. */
  drainPoints(): DailyPoint[] {
    const points = this.#points;
    this.#points = [];
    return points;
  }

  /** Live figures at `tick` with the securities valued now (TS §7.9). */
  figures(tick: Tick, securities: Cents): PerformanceFigures {
    const now: PortfolioValues = { cash: this.#cash(), securities };
    const price =
      this.benchmark === null ? null : this.#prices.priceAt(this.benchmark.series, tick, tick);
    return performanceFigures(this.#player.performance, tick, now, price);
  }

  #cash(): Cents {
    let sum = 0;
    for (const balance of this.#player.balances.values()) {
      sum += balance;
    }
    return sum;
  }
}
