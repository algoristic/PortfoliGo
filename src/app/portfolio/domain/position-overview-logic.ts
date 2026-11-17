import { SortDirection } from '@app/banking/domain/bank-comparison-logic';
import { marketValue } from '@app/shared/domain/money-logic';

import { costPerShare } from './lot-logic';
import {
  HeldPosition,
  PositionFigures,
  PositionOverview,
  PositionSort,
  PositionSortKey,
} from './models/portfolio.model';

/**
 * Combines the positions of several depots per instrument (US-PF-02 „zusammengefasst“): shares and
 * acquisition costs add up, the order is that of the first appearance.
 */
export function combinePositions(positions: readonly HeldPosition[]): HeldPosition[] {
  const combined = new Map<string, HeldPosition>();
  for (const position of positions) {
    const known = combined.get(position.instrumentId);
    combined.set(
      position.instrumentId,
      known === undefined
        ? { ...position }
        : {
            ...known,
            quantity: known.quantity + position.quantity,
            cost: known.cost + position.cost,
          },
    );
  }
  return [...combined.values()];
}

/**
 * Rows and sum row of the position table (US-PF-02, TS §7.9): value = shares × bid without mark-up
 * rounded to cents, gain = value − acquisition cost, its ratio to the acquisition cost, the share
 * of the value of all positions shown. A missing quote leaves the figures of its row and the sums
 * of values and shares open.
 */
export function positionOverview(positions: readonly HeldPosition[]): PositionOverview {
  const values = positions.map((position) =>
    position.bid === null ? null : marketValue(position.quantity, position.bid),
  );
  const cost = positions.reduce((sum, position) => sum + position.cost, 0);
  const complete = values.every((value) => value !== null);
  const value = complete ? values.reduce<number>((sum, part) => sum + (part ?? 0), 0) : null;
  const rows = positions.map((position, index): PositionFigures => {
    const rowValue = values[index];
    const gain = rowValue === null ? null : rowValue - position.cost;
    return {
      instrumentId: position.instrumentId,
      name: position.name,
      quantity: position.quantity,
      cost: position.cost,
      averageCost: costPerShare(position.cost, position.quantity),
      price: position.bid,
      value: rowValue,
      gain,
      gainRatio: ratio(gain, position.cost),
      share: rowValue === null || value === null || value <= 0 ? null : rowValue / value,
    };
  });
  const gain = value === null ? null : value - cost;
  return { rows, totals: { cost, value, gain, gainRatio: ratio(gain, cost) } };
}

/** Names sort ascending first, figures descending (as in the screener). */
export function defaultPositionSortDirection(key: PositionSortKey): SortDirection {
  return key === 'name' ? 'ascending' : 'descending';
}

/** Sorting by the same column again reverses the direction; another column starts at its default. */
export function nextPositionSort(current: PositionSort, key: PositionSortKey): PositionSort {
  if (current.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { key, direction: defaultPositionSortDirection(key) };
}

/**
 * Rows sorted by a column (US-PF-02): missing values always last, ties by name (German collation)
 * and instrument ID. Returns a new array.
 */
export function sortPositions(
  rows: readonly PositionFigures[],
  sort: PositionSort,
): PositionFigures[] {
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const byName = (a: PositionFigures, b: PositionFigures): number =>
    // eslint-disable-next-line no-restricted-syntax -- display sort only (TS §4.5)
    a.name.localeCompare(b.name, 'de') || a.instrumentId.localeCompare(b.instrumentId);
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') {
      return sign * byName(a, b);
    }
    const left = a[sort.key];
    const right = b[sort.key];
    if (left === null || right === null) {
      return (left === null ? 1 : 0) - (right === null ? 1 : 0) || byName(a, b);
    }
    return sign * (left - right) || byName(a, b);
  });
}

function ratio(gain: number | null, cost: number): number | null {
  return gain === null || cost <= 0 ? null : gain / cost;
}
