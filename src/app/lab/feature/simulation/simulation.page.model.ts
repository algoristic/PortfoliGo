export interface SeedFormModel {
  seed: string;
}

/** Calendar days per simulation button. */
export const SIMULATION_STEPS = [1, 7, 30, 365] as const;
export type SimulationStep = (typeof SIMULATION_STEPS)[number];

/** Years per simulation button for long runs (same calendar date, TS §6.9). */
export const SIMULATION_YEAR_STEPS = [10, 50] as const;
export type SimulationYearStep = (typeof SIMULATION_YEAR_STEPS)[number];
