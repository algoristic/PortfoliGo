import { SortDirection } from '@app/banking/domain/bank-comparison-logic';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

/** Columns the position table sorts by (US-PF-02). */
export const POSITION_SORT_KEYS = [
  'name',
  'quantity',
  'averageCost',
  'price',
  'value',
  'gain',
  'gainRatio',
  'share',
] as const;
export type PositionSortKey = (typeof POSITION_SORT_KEYS)[number];

export interface PositionSort {
  key: PositionSortKey;
  direction: SortDirection;
}

/** The table starts with the largest positions first. */
export const DEFAULT_POSITION_SORT: PositionSort = { key: 'value', direction: 'descending' };

/** A held instrument with what valuing it needs: shares, acquisition cost and the bid. */
export interface HeldPosition {
  instrumentId: string;
  name: string;
  quantity: MicroUnits;
  /** Acquisition cost of the shares held, costs included (TS §7.6). */
  cost: Cents;
  /** Bid without a venue mark-up (TS §7.9); `null` until the quote is known. */
  bid: number | null;
}

/** A row of the position table (US-PF-02); figures that need the quote are `null` without it. */
export interface PositionFigures {
  instrumentId: string;
  name: string;
  quantity: MicroUnits;
  cost: Cents;
  /** Acquisition cost per share in euros (TS §7.6). */
  averageCost: number | null;
  /** Current price: the bid without mark-up (TS §7.9). */
  price: number | null;
  /** Shares × bid, rounded to cents (TS §7.9). */
  value: Cents | null;
  /** Value − acquisition cost. */
  gain: Cents | null;
  /** Gain relative to the acquisition cost. */
  gainRatio: number | null;
  /** Value relative to the value of all positions shown; `null` while one value is missing. */
  share: number | null;
}

/** The sum row of the position table; values are `null` while a quote is missing. */
export interface PositionTotals {
  cost: Cents;
  value: Cents | null;
  gain: Cents | null;
  gainRatio: number | null;
}

export interface PositionOverview {
  rows: PositionFigures[];
  totals: PositionTotals;
}
