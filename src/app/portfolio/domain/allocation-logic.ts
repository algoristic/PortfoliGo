import { Cents } from '@app/shared/domain/models/money.model';

import {
  AllocationEntry,
  AllocationHolding,
  AssetClass,
  RegionKey,
  SectorKey,
  UNASSIGNED,
  WeightShare,
} from './models/allocation.model';

/**
 * Splits whole cents by weights so that the parts add up to exactly `total` (largest remainder):
 * every part gets the cents below its quota, the cents left over go one each to the largest
 * remainders, ties to the earlier part. Weights need not sum to 1.
 */
export function apportionCents(total: Cents, weights: readonly number[]): Cents[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`apportionCents: ${total} is not a non-negative number of cents`);
  }
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (weights.some((weight) => !(weight >= 0)) || !(sum > 0)) {
    throw new RangeError('apportionCents: the weights must be non-negative with a positive sum');
  }
  const quotas = weights.map((weight) => (total * weight) / sum);
  const parts = quotas.map((quota) => Math.floor(quota));
  let left = total - parts.reduce((acc, part) => acc + part, 0);
  const order = quotas
    .map((quota, index) => ({ index, remainder: quota - parts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) {
      break;
    }
    parts[index] += 1;
    left -= 1;
  }
  return parts;
}

/**
 * Sums values per key and gives each key its share of the whole (US-PF-03): keys without a
 * positive value are left out; largest first, ties in the order of first appearance. The shares
 * add up to 1 (rounding happens in the display only).
 */
export function allocate<K extends string>(
  parts: Iterable<{ key: K; value: Cents }>,
): AllocationEntry<K>[] {
  const sums = new Map<K, Cents>();
  for (const { key, value } of parts) {
    sums.set(key, (sums.get(key) ?? 0) + value);
  }
  const entries = [...sums].filter(([, value]) => value > 0);
  const total = entries.reduce((acc, [, value]) => acc + value, 0);
  return entries
    .map(([key, value], index) => ({ key, value, share: value / total, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(({ key, value, share }) => ({ key, value, share }));
}

/**
 * Allocation by asset class (US-PF-03): shares, ETFs and the money on the accounts („Liquidität“);
 * a negative balance counts as no money.
 */
export function assetClassAllocation(
  holdings: readonly AllocationHolding[],
  cash: Cents,
): AllocationEntry<AssetClass>[] {
  return allocate<AssetClass>([
    ...holdings.map(({ kind, value }) => ({ key: kind, value })),
    { key: 'cash', value: Math.max(0, cash) },
  ]);
}

/**
 * Allocation of the securities by region with look-through (US-PF-03, E-28): a share counts with
 * its region, an ETF splits its value by the region weights of its index (`apportionCents`, so
 * the parts keep its value to the cent); without a composition its value is `unassigned`.
 */
export function regionAllocation(
  holdings: readonly AllocationHolding[],
): AllocationEntry<RegionKey>[] {
  return allocate<RegionKey>(
    holdings.flatMap((holding) =>
      holding.kind === 'stock'
        ? [{ key: holding.regionId, value: holding.value }]
        : lookThrough(holding.value, holding.composition?.regions ?? null),
    ),
  );
}

/** Allocation of the securities by sector with look-through, as `regionAllocation`. */
export function sectorAllocation(
  holdings: readonly AllocationHolding[],
): AllocationEntry<SectorKey>[] {
  return allocate<SectorKey>(
    holdings.flatMap((holding) =>
      holding.kind === 'stock'
        ? [{ key: holding.sectorId, value: holding.value }]
        : lookThrough(holding.value, holding.composition?.sectors ?? null),
    ),
  );
}

function lookThrough<K extends string>(
  value: Cents,
  shares: readonly WeightShare<K>[] | null,
): { key: K | typeof UNASSIGNED; value: Cents }[] {
  const weights = shares?.map((share) => share.weight) ?? [];
  if (shares === null || !(weights.reduce((acc, weight) => acc + weight, 0) > 0)) {
    return [{ key: UNASSIGNED, value }];
  }
  const parts = apportionCents(value, weights);
  return shares.map((share, index) => ({ key: share.key, value: parts[index] }));
}
