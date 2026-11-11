import { IndexLayout } from './index-layout';
import { MarketLayout } from './market-layout';
import { MarketConfig } from './models/market-config.model';

import { DividendSchedule } from '../../world/domain/models/company.model';
import { EtfDistributionFrequency } from '../../world/domain/models/etf.model';
import { World } from '../../world/domain/models/world.model';

export interface EtfDistributionTerms {
  frequency: EtfDistributionFrequency;
  schedule: DividendSchedule;
}

/** ETFs of the world in a fixed order with their constants in flat arrays (TS §6.6). */
export interface EtfLayout {
  ids: readonly string[];
  /** Index x of the tracked index in the `IndexLayout`. */
  indexOf: Int32Array;
  /** Distribution terms of distributing ETFs; `null` for accumulating ETFs. */
  distributions: readonly (EtfDistributionTerms | null)[];
  /** TER p. a. */
  ter: Float64Array;
  /** Standard deviation of the daily tracking noise on `k`. */
  dailyTrackingSd: Float64Array;
  /** `k₀ = start price / base value`, so the NAV starts at the start price. */
  initialScale: Float64Array;
  /** Boundaries of the open and close of the ETF's exchange. */
  openBoundary: Int32Array;
  closeBoundary: Int32Array;
  /**
   * Share of the index weight at the epoch whose exchanges are closed in interval j (between the
   * boundaries j and j + 1), per ETF: `e · intervalCount + j`. Fixed in stage 1 like the weights.
   */
  closedShare: Float64Array;
}

export function createEtfLayout(
  world: World,
  layout: MarketLayout,
  indices: IndexLayout,
  config: MarketConfig,
): EtfLayout {
  const indexPosition = new Map(indices.ids.map((id, x) => [id, x]));
  const exchanges = new Map(world.exchanges.map((exchange) => [exchange.id, exchange]));
  const count = world.etfs.length;
  const intervalCount = layout.boundaries.length - 1;
  const sqrtDayYears = Math.sqrt(1 / config.tradingDaysPerYear);
  const etfLayout: EtfLayout = {
    ids: world.etfs.map((etf) => etf.id),
    indexOf: new Int32Array(count),
    distributions: world.etfs.map(({ distribution }) =>
      distribution.kind === 'distributing'
        ? { frequency: distribution.frequency, schedule: distribution.schedule }
        : null,
    ),
    ter: new Float64Array(count),
    dailyTrackingSd: new Float64Array(count),
    initialScale: new Float64Array(count),
    openBoundary: new Int32Array(count),
    closeBoundary: new Int32Array(count),
    closedShare: new Float64Array(count * intervalCount),
  };
  const closedShares = indices.ids.map((_id, x) => indexClosedShare(world, layout, indices, x));
  world.etfs.forEach((etf, e) => {
    const x = indexPosition.get(etf.indexId);
    const exchange = exchanges.get(etf.exchangeId);
    if (x === undefined || exchange === undefined) {
      throw new Error(`createEtfLayout: unknown index or exchange of ${etf.id}`);
    }
    etfLayout.indexOf[e] = x;
    etfLayout.ter[e] = etf.ter;
    etfLayout.dailyTrackingSd[e] = config.etfTrackingError[etf.replication] * sqrtDayYears;
    etfLayout.initialScale[e] = etf.startPrice / world.indices[x].baseValue;
    etfLayout.openBoundary[e] = layout.boundaries.indexOf(exchange.open);
    etfLayout.closeBoundary[e] = layout.boundaries.indexOf(exchange.close);
    etfLayout.closedShare.set(closedShares[x], e * intervalCount);
  });
  return etfLayout;
}

/** Share of the epoch weight of index x whose exchanges are closed, per interval. */
function indexClosedShare(
  world: World,
  layout: MarketLayout,
  indices: IndexLayout,
  x: number,
): Float64Array {
  const intervalCount = layout.boundaries.length - 1;
  const closed = new Float64Array(intervalCount);
  let total = 0;
  for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
    const i = indices.members[n];
    const weight = indices.shares[n] * world.companies[i].startPrice;
    total += weight;
    for (let j = 0; j < intervalCount; j++) {
      if (j < layout.openBoundary[i] || j >= layout.closeBoundary[i]) {
        closed[j] += weight;
      }
    }
  }
  for (let j = 0; j < intervalCount; j++) {
    closed[j] /= total;
  }
  return closed;
}
