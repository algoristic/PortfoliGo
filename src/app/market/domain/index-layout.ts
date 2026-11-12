import { World } from '@app/world/domain/models/world.model';

import { MarketLayout } from './market-layout';

/**
 * Indices of the world in a fixed order with their constituents in flat arrays (TS §5.5, §6.6).
 * The composition and the capped share counts are fixed at the epoch in stage 1, so the divisor
 * is a constant.
 */
export interface IndexLayout {
  ids: readonly string[];
  /** Constituents of index x: `members[memberStart[x]] … members[memberStart[x + 1] − 1]`. */
  memberStart: Int32Array;
  /** Instrument index in the `MarketLayout`, ascending by company id. */
  members: Int32Array;
  /** Free-float shares × capping factor per constituent entry (`n_i`). */
  shares: Float64Array;
  /** Divisor `D`: the index starts at its base value at the epoch. */
  divisor: Float64Array;
  /** Boundaries of the earliest open and the latest close of the constituents' exchanges. */
  openBoundary: Int32Array;
  closeBoundary: Int32Array;
}

const MAX_CAPPING_ROUNDS = 100;

export function createIndexLayout(world: World, layout: MarketLayout): IndexLayout {
  const instrumentIndex = new Map(layout.instrumentIds.map((id, i) => [id, i]));
  const companies = world.companies;
  const memberCount = world.indices.reduce((sum, index) => sum + index.constituents.length, 0);
  const indexLayout: IndexLayout = {
    ids: world.indices.map((index) => index.id),
    memberStart: new Int32Array(world.indices.length + 1),
    members: new Int32Array(memberCount),
    shares: new Float64Array(memberCount),
    divisor: new Float64Array(world.indices.length),
    openBoundary: new Int32Array(world.indices.length),
    closeBoundary: new Int32Array(world.indices.length),
  };
  let entry = 0;
  world.indices.forEach((index, x) => {
    indexLayout.memberStart[x] = entry;
    const members = index.constituents.map((id) => {
      const i = instrumentIndex.get(id);
      if (i === undefined) {
        throw new Error(`createIndexLayout: unknown constituent ${id} of ${index.id}`);
      }
      return i;
    });
    const marketCaps = members.map((i) => companies[i].freeFloatShares * companies[i].startPrice);
    const factors = cappingFactors(marketCaps, index.capWeight);
    let open = Number.MAX_SAFE_INTEGER;
    let close = -1;
    let startValue = 0;
    members.forEach((i, n) => {
      const shares = companies[i].freeFloatShares * factors[n];
      indexLayout.members[entry + n] = i;
      indexLayout.shares[entry + n] = shares;
      startValue += shares * companies[i].startPrice;
      open = Math.min(open, layout.openBoundary[i]);
      close = Math.max(close, layout.closeBoundary[i]);
    });
    indexLayout.divisor[x] = startValue / index.baseValue;
    indexLayout.openBoundary[x] = open;
    indexLayout.closeBoundary[x] = close;
    entry += members.length;
  });
  indexLayout.memberStart[world.indices.length] = entry;
  return indexLayout;
}

/**
 * Factor per constituent that caps its weight at `capWeight` (TS §5.5). The excess is spread
 * proportionally over the uncapped constituents until no weight exceeds the cap. Without a cap,
 * or when the cap cannot be met (`count · cap ≤ 1`), the weights stay as they are or become equal.
 */
export function cappingFactors(marketCaps: readonly number[], capWeight: number | null): number[] {
  const count = marketCaps.length;
  const total = marketCaps.reduce((sum, value) => sum + value, 0);
  const weights = marketCaps.map((value) => value / total);
  if (capWeight === null || weights.every((weight) => weight <= capWeight)) {
    return marketCaps.map(() => 1);
  }
  if (count * capWeight <= 1) {
    return weights.map((weight) => 1 / count / weight);
  }
  const capped = new Array<boolean>(count).fill(false);
  const result = weights.slice();
  for (let round = 0; round < MAX_CAPPING_ROUNDS; round++) {
    let cappedCount = 0;
    let freeWeight = 0;
    for (let n = 0; n < count; n++) {
      if (capped[n]) {
        cappedCount++;
      } else {
        freeWeight += weights[n];
      }
    }
    const scale = (1 - cappedCount * capWeight) / freeWeight;
    let changed = false;
    for (let n = 0; n < count; n++) {
      if (capped[n]) {
        result[n] = capWeight;
      } else {
        result[n] = weights[n] * scale;
        if (result[n] > capWeight) {
          capped[n] = true;
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return result.map((weight, n) => weight / weights[n]);
}
