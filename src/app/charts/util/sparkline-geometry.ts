import { ChangeDirection } from '@app/shared/util/change-direction';

/** Path of a sparkline in a `width` × `height` view box, the reference line and the direction. */
export interface SparklineGeometry {
  /** SVG path data (`M x y L x y …`); empty without values. */
  path: string;
  /** Height of the reference line, `null` without a reference. */
  referenceY: number | null;
  /** Last value against the reference, or against the first value without one. */
  direction: ChangeDirection;
}

/** Coordinates in the path keep two decimal places. */
const COORDINATE_FACTOR = 100;

function coordinate(value: number): number {
  return Math.round(value * COORDINATE_FACTOR) / COORDINATE_FACTOR;
}

/**
 * Geometry of a sparkline (E-04): the values spread evenly over the width, the range of values and
 * reference over the height minus `inset` at the top and bottom (room for the stroke). Equal values
 * lie in the middle; non-finite values are skipped, a single value is a horizontal line.
 */
export function sparklineGeometry(
  values: readonly number[],
  reference: number | null,
  width: number,
  height: number,
  inset = 1,
): SparklineGeometry {
  const points = values.filter(Number.isFinite);
  const hasReference = reference !== null && Number.isFinite(reference);
  if (points.length === 0) {
    return { path: '', referenceY: null, direction: 'flat' };
  }
  const range = hasReference ? [...points, reference] : points;
  const min = Math.min(...range);
  const max = Math.max(...range);
  const span = height - 2 * inset;
  const y = (value: number): number =>
    coordinate(max === min ? height / 2 : inset + ((max - value) / (max - min)) * span);
  const series = points.length === 1 ? [points[0], points[0]] : points;
  const step = width / (series.length - 1);
  const path = series
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${coordinate(index * step)} ${y(value)}`)
    .join(' ');
  const last = points[points.length - 1];
  const base = hasReference ? reference : points[0];
  return {
    path,
    referenceY: hasReference ? y(reference) : null,
    direction: last > base ? 'up' : last < base ? 'down' : 'flat',
  };
}
