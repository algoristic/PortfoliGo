import { median } from '@app/analysis/domain/statistics-logic';

import { CALIBRATION_TARGETS, CalibrationTarget } from '../calibration-targets';
import { LabSimulation } from '../lab-simulation';
import { LabStatistics, LongTermCheckpoint, RollingWindows } from '../models/lab-statistics.model';
import { COMPARISON_YEARS } from '../seed-comparison';

/** Longest minimum period of a target that the prehistory (about 10.25 years) can measure. */
export const PREHISTORY_TARGET_YEARS = 10;

/** The lab's statistics of a seed after the prehistory and 100 years after the game start. */
export interface CalibrationRun {
  seed: string;
  prehistory: LabStatistics;
  long: LabStatistics;
}

/** Measures a seed like the calibration suite (TS §6.9): prehistory, then 100 years. */
export function measureCalibrationRun(seed: string): CalibrationRun {
  const simulation = new LabSimulation(seed);
  simulation.runPrehistory();
  const prehistory = simulation.statistics('epoch');
  simulation.simulateYears(COMPARISON_YEARS);
  return { seed, prehistory, long: simulation.statistics('epoch') };
}

/** Whether the prehistory or the long run measures a target (rule of TS §6.9). */
export function measuredOverLongRun(target: CalibrationTarget): boolean {
  return (target.minYears ?? 0) > PREHISTORY_TARGET_YEARS;
}

export function targetValue(statistics: LabStatistics, id: string): number {
  return statistics.targets.find((row) => row.id === id)?.value ?? Number.NaN;
}

export function checkpointOf(run: CalibrationRun, years: number): LongTermCheckpoint | undefined {
  return run.long.longTerm.checkpoints.find((entry) => entry.years === years);
}

export function windowOf(
  run: CalibrationRun,
  years: number | undefined,
): RollingWindows | undefined {
  return run.long.longTerm.windows.find((entry) => entry.years === years);
}

function summary(values: number[]): string {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return '–';
  }
  const text = (value: number): string => value.toPrecision(4);
  return `${text(median(finite))} (${text(Math.min(...finite))} … ${text(Math.max(...finite))})`;
}

/**
 * Text report of all targets and long-term measures: median and range over the seeds, separately
 * for the prehistory and the long run, with the band and whether the median lies in it. Info for
 * the change log (AP 7.3a); it checks nothing.
 */
export function calibrationReport(title: string, runs: CalibrationRun[]): string {
  const lines = [`${title} (${runs.length} seeds: ${runs.map((run) => run.seed).join(', ')})`];
  for (const target of CALIBRATION_TARGETS as readonly CalibrationTarget[]) {
    const prehistory = runs.map((run) => targetValue(run.prehistory, target.id));
    const long = runs.map((run) => targetValue(run.long, target.id));
    const banded = target.min !== undefined || target.max !== undefined;
    let band = 'info';
    if (banded) {
      const value = median(measuredOverLongRun(target) ? long : prehistory);
      const inBand =
        (target.min === undefined || value >= target.min) &&
        (target.max === undefined || value <= target.max);
      band = `${target.min ?? ''}…${target.max ?? ''} ${inBand ? 'ok' : 'OFF'}`;
    }
    lines.push(
      `${target.id}: prehistory ${summary(prehistory)} | 110 years ${summary(long)} | ${band}`,
    );
  }
  for (const years of [0, 10, 25, 50, 100]) {
    const at = runs.map((run) => checkpointOf(run, years));
    lines.push(
      `checkpoint +${years} years: top five ${summary(at.map((c) => c?.topFiveShare ?? NaN))}` +
        ` | below 1 € ${summary(at.map((c) => c?.belowOneEuro.all ?? NaN))}` +
        ` | at floor ${summary(at.map((c) => c?.atFloor ?? NaN))}` +
        ` | highest price ${summary(at.map((c) => c?.maxPrice ?? NaN))}`,
    );
  }
  for (const years of [10, 30]) {
    const windows = runs.map((run) => windowOf(run, years));
    lines.push(
      `${years}-year windows: median return ${summary(windows.map((w) => w?.totalReturn.median ?? NaN))}` +
        ` | worst return ${summary(windows.map((w) => w?.totalReturn.min ?? NaN))}` +
        ` | median volatility ${summary(windows.map((w) => w?.volatility.median ?? NaN))}` +
        ` | median dividend yield ${summary(windows.map((w) => w?.dividendYield.median ?? NaN))}`,
    );
  }
  return lines.join('\n');
}
