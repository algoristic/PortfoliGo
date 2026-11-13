import { Cents } from '@app/shared/domain/models/money.model';
import { applyRate } from '@app/shared/domain/money-logic';
import { normal } from '@app/simulation/util/distributions';
import { createStream } from '@app/simulation/util/random-stream';
import { SeedKey } from '@app/simulation/util/seed';

import { monthKey } from './bank-run-logic';
import { CalendarMonth } from './models/household.model';

/** ε ~ N(0; 0.05), bounded to ±0.15 (TS §7.4, US-EK-02). */
export const LIVING_COSTS_DEVIATION_SD = 0.05;
export const LIVING_COSTS_MAX_DEVIATION = 0.15;

/** `life/living-costs/2030-04` (TS §4.2): one stream per month, independent of the player's actions. */
export function livingCostsStreamKey(month: CalendarMonth): string {
  return `life/living-costs/${monthKey(month)}`;
}

/** Bounds a drawn deviation to ±`LIVING_COSTS_MAX_DEVIATION`. */
export function boundedDeviation(epsilon: number): number {
  return Math.min(LIVING_COSTS_MAX_DEVIATION, Math.max(-LIVING_COSTS_MAX_DEVIATION, epsilon));
}

/** ε of the month: the first normal draw of the month's stream, bounded. */
export function livingCostsDeviation(seedKey: SeedKey, month: CalendarMonth): number {
  const rng = createStream(seedKey, livingCostsStreamKey(month));
  return boundedDeviation(normal(rng, 0, LIVING_COSTS_DEVIATION_SD));
}

/** Living costs of the month: base × (1 + ε), rounded to cents. */
export function livingCosts(seedKey: SeedKey, base: Cents, month: CalendarMonth): Cents {
  return applyRate(base, 1 + livingCostsDeviation(seedKey, month));
}
