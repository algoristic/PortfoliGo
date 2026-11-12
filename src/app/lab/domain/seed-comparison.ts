/**
 * Seeds of the seed comparison in the lab (TS §14.2). They are the seeds of the calibration suite,
 * so that AP 1.9 calibrates on the same worlds the lab shows.
 */
export const COMPARISON_SEEDS = ['calib-1', 'calib-2', 'calib-3', 'calib-4', 'calib-5'] as const;
/** Game years after the game start per seed of the comparison (TS §6.9, E-22). */
export const COMPARISON_YEARS = 100;
