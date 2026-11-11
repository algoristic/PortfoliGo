export interface SeedFormModel {
  seed: string;
}

/** Calendar days per simulation button. */
export const SIMULATION_STEPS = [1, 7, 30, 365] as const;
export type SimulationStep = (typeof SIMULATION_STEPS)[number];
