import { TargetRow, TargetStatus, TargetUnit } from './models/lab-statistics.model';

/**
 * Calibration targets of TS §6.9 with their measurement rule (AP 1.8a, AP 1.8b, AP 1.9a, AP 1.9b).
 * Without `min` and `max` a quantity is shown for information.
 */
export interface CalibrationTarget {
  id: string;
  unit: TargetUnit;
  min?: number;
  max?: number;
  /** Shortest period in years for a meaningful value. */
  minYears?: number;
}

export const CALIBRATION_TARGETS = [
  { id: 'world-return', unit: 'percent', min: 0.06, max: 0.08, minYears: 30 },
  { id: 'world-price-return', unit: 'percent' },
  { id: 'world-volatility', unit: 'percent', min: 0.14, max: 0.18, minYears: 5 },
  { id: 'large-volatility', unit: 'percent', min: 0.2, max: 0.3, minYears: 1 },
  { id: 'mid-volatility', unit: 'percent' },
  { id: 'small-volatility', unit: 'percent', min: 0.35, max: 0.6, minYears: 1 },
  // Large caps of the same region (E-31); all pairs of the same region for information.
  { id: 'correlation-within', unit: 'number', min: 0.5, max: 0.6, minYears: 1 },
  { id: 'correlation-between', unit: 'number', min: 0.2, max: 0.35, minYears: 1 },
  { id: 'correlation-within-all', unit: 'number' },
  { id: 'correlation-between-all', unit: 'number' },
  { id: 'weekly-correlation-within', unit: 'number' },
  { id: 'weekly-correlation-between', unit: 'number' },
  { id: 'bear-markets', unit: 'per-year', min: 1 / 8, max: 1 / 5, minYears: 50 },
  { id: 'world-kurtosis', unit: 'number', min: 5, minYears: 5 },
  { id: 'stock-kurtosis', unit: 'number', min: 5, minYears: 5 },
  { id: 'clustering-lag1', unit: 'number', min: 0.1, max: 0.3, minYears: 5 },
  { id: 'clustering-mean', unit: 'number', min: 0, minYears: 5 },
  { id: 'world-dividend-yield', unit: 'percent', min: 0.02, max: 0.03, minYears: 1 },
  { id: 'stock-dividend-yield-median', unit: 'percent' },
  { id: 'stock-dividend-yield-max', unit: 'percent', min: 0, max: 0.07, minYears: 1 },
  { id: 'intraday-profile', unit: 'number' },
  { id: 'overnight-share-world', unit: 'percent' },
  { id: 'overnight-share-north-america', unit: 'percent', min: 0.15, max: 0.35, minYears: 5 },
  { id: 'overnight-share-europe', unit: 'percent', min: 0.15, max: 0.35, minYears: 5 },
  { id: 'overnight-share-asia-pacific', unit: 'percent', min: 0.3, max: 0.6, minYears: 5 },
  // The session of the index spans India and Brazil (04:45–21:00), so its gap is not an overnight
  // gap of one market (E-30).
  { id: 'overnight-share-emerging-markets', unit: 'percent' },
  { id: 'overnight-share-stocks', unit: 'percent', min: 0.15, max: 0.35, minYears: 5 },
] as const satisfies readonly CalibrationTarget[];

/** Limit of a long-term measure (TS §6.9, E-22); either bound may be missing. */
export interface LongTermLimit {
  min?: number;
  max?: number;
  /** Window length in years for limits of rolling windows. */
  years?: number;
}

/** Checkpoints in game years at which the limits of the long-term measures apply (E-22). */
export const LONG_TERM_LIMIT_YEARS = [50, 100] as const;

/**
 * Limits of the long-term behaviour (TS §6.9, E-22), checked in the median of the calibration
 * seeds: at the checkpoints of `LONG_TERM_LIMIT_YEARS` and for the medians of the rolling windows.
 */
export const LONG_TERM_LIMITS = {
  topFiveShare: { max: 0.4 },
  belowOneEuro: { max: 0.1 },
  atFloor: { max: 0.02 },
  windowVolatility: { years: 10, min: 0.13, max: 0.2 },
  windowDividendYield: { years: 30, min: 0.015 },
} as const satisfies Record<string, LongTermLimit>;

export type CalibrationTargetId = (typeof CALIBRATION_TARGETS)[number]['id'];

/** Status of a measured value against its target for a period of `years`. */
export function targetStatus(
  target: CalibrationTarget,
  value: number,
  years: number,
): TargetStatus {
  if (target.min === undefined && target.max === undefined) {
    return 'info';
  }
  if (Number.isNaN(value) || years < (target.minYears ?? 0)) {
    return 'short';
  }
  const aboveMin = target.min === undefined || value >= target.min;
  const belowMax = target.max === undefined || value <= target.max;
  return aboveMin && belowMax ? 'ok' : 'off';
}

/** Rows in the order of the targets; quantities missing in `values` count as not measurable. */
export function targetRows(
  values: Partial<Record<CalibrationTargetId, number>>,
  years: number,
): TargetRow[] {
  return CALIBRATION_TARGETS.map((target: CalibrationTarget) => {
    const value = values[target.id as CalibrationTargetId] ?? Number.NaN;
    return {
      id: target.id,
      value,
      unit: target.unit,
      ...(target.min === undefined ? {} : { min: target.min }),
      ...(target.max === undefined ? {} : { max: target.max }),
      ...(target.minYears === undefined ? {} : { minYears: target.minYears }),
      status: targetStatus(target, value, years),
    };
  });
}
