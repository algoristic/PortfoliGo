/** A part of a donut with its value (any unit; the shares follow from the sum). */
export interface DonutValue {
  id: string;
  value: number;
}

/** A segment as a dashed circle: `dashArray` draws its arc, `dashOffset` moves it to its start. */
export interface DonutStroke {
  id: string;
  /** Share of the whole, 0 to 1. */
  fraction: number;
  dashArray: string;
  dashOffset: number;
}

/** Dash lengths keep three decimal places. */
const LENGTH_FACTOR = 1000;

function length(value: number): number {
  return Math.round(value * LENGTH_FACTOR) / LENGTH_FACTOR;
}

/**
 * Segments of a donut (E-04) on a circle of `radius`, clockwise from the start of the circle in
 * the given order. Values that are not positive or not finite get no segment.
 */
export function donutStrokes(values: readonly DonutValue[], radius: number): DonutStroke[] {
  const parts = values.filter(({ value }) => Number.isFinite(value) && value > 0);
  const total = parts.reduce((sum, { value }) => sum + value, 0);
  const circumference = 2 * Math.PI * radius;
  let start = 0;
  return parts.map(({ id, value }) => {
    const fraction = value / total;
    const stroke = {
      id,
      fraction,
      dashArray: `${length(fraction * circumference)} ${length(circumference)}`,
      // `0 - x` instead of `-x`, so the first segment starts at +0.
      dashOffset: length(0 - start * circumference),
    };
    start += fraction;
    return stroke;
  });
}
