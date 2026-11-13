// Levels of the sector heat map on the markets page (US-MK-01, TS §11.3): the daily change of a
// sector index in a few steps per direction, so the colour intensity says how strong it moved.

/** From these absolute changes on (ratios, inclusive), a tile reaches level 1, 2, 3 and 4. */
export const HEAT_LEVEL_BOUNDS = [0.0005, 0.005, 0.01, 0.02] as const;

export const HEAT_LEVELS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;
/** Negative for losses, positive for gains, 0 for (almost) unchanged. */
export type HeatLevel = (typeof HEAT_LEVELS)[number];

/** The level of a daily change (`changeRatio` of the quote); non-finite values are 0. */
export function heatLevel(changeRatio: number): HeatLevel {
  if (!Number.isFinite(changeRatio)) {
    return 0;
  }
  const size = Math.abs(changeRatio);
  let level = 0;
  for (const bound of HEAT_LEVEL_BOUNDS) {
    if (size >= bound) {
      level++;
    }
  }
  if (level === 0) {
    return 0;
  }
  return (changeRatio < 0 ? -level : level) as HeatLevel;
}
