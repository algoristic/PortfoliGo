import { Quote } from '@app/shared/domain/models/quote.model';
import { bidAsk } from '@app/shared/domain/price-step-logic';
import { detLog } from '@app/simulation/util/det-math';
import { SIZE_CLASSES } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';

import { MarketContext } from './market-context';
import { MarketConfig, MarketPhase, MarketRange } from './models/market-config.model';
import { seriesRef } from './series';

/** Base spread per tradable instrument (TS §6.7), fixed per world. */
export interface SpreadLayout {
  /** Per share, in the order of the `MarketLayout`. */
  stockBase: Float64Array;
  /** Per ETF, in the order of the `EtfLayout`. */
  etfBase: Float64Array;
}

/**
 * Base spreads by size: within the range of its size class, a share gets the lower end the larger
 * its market capitalisation is (log scale); ETFs likewise by fund volume.
 */
export function createSpreadLayout(world: World, config: MarketConfig): SpreadLayout {
  const { base } = config.spreads;
  const stockBase = new Float64Array(world.companies.length);
  for (const size of SIZE_CLASSES) {
    const members = world.companies.flatMap((company, i) =>
      company.size === size ? [{ i, value: company.marketCap }] : [],
    );
    interpolate(
      members.map(({ value }) => value),
      base[size],
    ).forEach((spread, n) => {
      stockBase[members[n].i] = spread;
    });
  }
  return {
    stockBase,
    etfBase: Float64Array.from(
      interpolate(
        world.etfs.map((etf) => etf.fundVolume),
        base.etf,
      ),
    ),
  };
}

/**
 * Relative spread of a share or ETF at a minute of the day (TS §6.7) before the venue mark-up:
 * `base × phase factor × (1 + (closed factor − 1) × closed share)`. A share counts as closed
 * outside its own session; an ETF by the weight of its index whose exchanges are closed.
 */
export function marketSpread(
  context: MarketContext,
  series: number,
  phase: MarketPhase,
  minute: number,
): number {
  const { layout, etfs, spreads, config } = context;
  const { kind, index } = seriesRef(context, series);
  let base: number;
  let closedShare: number;
  if (kind === 'stock') {
    base = spreads.stockBase[index];
    const open = layout.boundaries[layout.openBoundary[index]];
    const close = layout.boundaries[layout.closeBoundary[index]];
    closedShare = minute >= open && minute < close ? 0 : 1;
  } else if (kind === 'etf') {
    base = spreads.etfBase[index];
    const intervalCount = layout.boundaries.length - 1;
    closedShare = etfs.closedShare[index * intervalCount + intervalAt(context, minute)];
  } else {
    throw new RangeError(`marketSpread: series ${series} is an index and not tradable`);
  }
  const { phaseFactor, closedUnderlyingFactor } = config.spreads;
  return base * phaseFactor[phase] * (1 + (closedUnderlyingFactor - 1) * closedShare);
}

/** Quote around `mid` with the market spread plus the venue mark-up of the bank (TS §6.7). */
export function quote(mid: number, spread: number): Quote {
  return { mid, spread, ...bidAsk(mid, spread) };
}

/** Interval j with `boundaries[j] ≤ minute < boundaries[j + 1]`; 24:00 belongs to the last one. */
function intervalAt(context: MarketContext, minute: number): number {
  const { boundaries } = context.layout;
  let j = 0;
  while (j + 2 < boundaries.length && boundaries[j + 1] <= minute) {
    j++;
  }
  return j;
}

/** Lower end of the range for the largest value, upper end for the smallest (log scale). */
function interpolate(values: readonly number[], range: MarketRange): number[] {
  if (values.length === 0) {
    return [];
  }
  const logs = values.map((value) => detLog(value));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  return logs.map((log) => {
    const position = max > min ? (log - min) / (max - min) : 0.5;
    return range[0] + (range[1] - range[0]) * (1 - position);
  });
}
