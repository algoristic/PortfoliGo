import { RegionId, SectorId } from './taxonomy.model';

export const INDEX_KINDS = [
  'world',
  'region-broad',
  'region-leading',
  'sector',
  'small-cap',
  'dividend',
] as const;
export type IndexKind = (typeof INDEX_KINDS)[number];

/** Index definition; levels (price and total return index) are computed by the market (TS §6.6). */
export interface MarketIndex {
  id: string;
  name: string;
  ticker: string;
  kind: IndexKind;
  regionId: RegionId | null;
  sectorId: SectorId | null;
  /** Company ids, sorted ascending. */
  constituents: readonly string[];
  /** Weighted by free-float market capitalisation. */
  weighting: 'free-float-market-cap';
  /** Maximum weight of a single constituent, or `null` without capping. */
  capWeight: number | null;
  /** Level at the epoch. */
  baseValue: number;
}
