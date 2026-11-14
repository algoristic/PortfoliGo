import {
  DEFAULT_POSITION_SORT,
  HeldPosition,
  PositionFigures,
} from '@app/portfolio/domain/models/portfolio.model';
import {
  combinePositions,
  positionOverview,
  sortPositions,
} from '@app/portfolio/domain/position-overview-logic';

/** Positions the dashboard lists (PS §10.3). */
export const TOP_POSITION_COUNT = 5;

/**
 * The largest positions over all depots (PS §10.3): combined per instrument like „Alle Depots“ of
 * the depot page, valued like there (`positionOverview`), the `count` largest by value; positions
 * without a quote come last, ties by name.
 */
export function topPositions(
  positions: readonly HeldPosition[],
  count = TOP_POSITION_COUNT,
): PositionFigures[] {
  const { rows } = positionOverview(combinePositions(positions));
  return sortPositions(rows, DEFAULT_POSITION_SORT).slice(0, count);
}
