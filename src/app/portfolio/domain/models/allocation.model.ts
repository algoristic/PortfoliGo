import { Cents } from '@app/shared/domain/models/money.model';
import { RegionId, SectorId } from '@app/world/domain/models/taxonomy.model';

/**
 * Asset classes of the allocation (US-PF-03): shares, ETFs and money on the accounts
 * („Liquidität“). Indices are not tradable and never held.
 */
export const ASSET_CLASSES = ['stock', 'etf', 'cash'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Key of an ETF's value while the composition of its index is unknown. */
export const UNASSIGNED = 'unassigned';
export type Unassigned = typeof UNASSIGNED;

export type RegionKey = RegionId | Unassigned;
export type SectorKey = SectorId | Unassigned;

/** A weight of a split, as `instrumentComposition` reports it (TS §8.2). */
export interface WeightShare<K extends string> {
  key: K;
  weight: number;
}

/**
 * A held security as the allocation sees it: shares by their own region and sector, ETFs by the
 * regions and sectors of their index (look-through, E-28) once the composition is known.
 */
export type AllocationHolding =
  | {
      kind: 'stock';
      value: Cents;
      regionId: RegionId;
      sectorId: SectorId;
    }
  | {
      kind: 'etf';
      value: Cents;
      /** Weights of the tracked index; `null` while the composition is unknown. */
      composition: {
        regions: readonly WeightShare<RegionId>[];
        sectors: readonly WeightShare<SectorId>[];
      } | null;
    };

/** A part of the allocation: its value and its share of the whole. */
export interface AllocationEntry<K extends string> {
  key: K;
  value: Cents;
  share: number;
}
