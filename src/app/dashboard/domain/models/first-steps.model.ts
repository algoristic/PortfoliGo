/** Steps of the checklist „Erste Schritte“ in their order (US-UI-10). */
export const FIRST_STEPS = [
  'compare-banks',
  'open-depot',
  'transfer',
  'first-purchase',
  'savings-plan',
] as const;
export type FirstStepId = (typeof FIRST_STEPS)[number];

/** What the game state and this device tell about the player's progress. */
export interface FirstStepsFacts {
  /** The bank comparison was opened on this device (`pgo.ui.firstSteps`). */
  banksVisited: boolean;
  /** Depots ever opened, closed ones included. */
  depots: number;
  /** Balances of the clearing accounts (open and closed). */
  clearingBalances: readonly number[];
  /** Instruments held now in any depot. */
  positions: number;
  /** Executed orders the order history keeps. */
  executedOrders: number;
  /** Savings plans, paused ones included. */
  savingsPlans: number;
}

export interface FirstStep {
  id: FirstStepId;
  done: boolean;
}

/** The device-local part of the checklist per player (TS §9.3 `pgo.ui.firstSteps`). */
export interface FirstStepsSettings {
  hidden: boolean;
  banksVisited: boolean;
}
