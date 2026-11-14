import { FIRST_STEPS, FirstStep, FirstStepId, FirstStepsFacts } from './models/first-steps.model';

/**
 * The checklist „Erste Schritte“ (US-UI-10, TS §11.3) from the state: a depot was opened; money
 * reached a clearing account (a positive balance) or a purchase happened; a purchase is a held
 * position or an executed order (a sold-out first purchase still counts); a savings plan exists;
 * the bank comparison was visited on this device. Each step counts on its own, in any order.
 */
export function firstSteps(facts: FirstStepsFacts): FirstStep[] {
  const purchased = facts.positions > 0 || facts.executedOrders > 0;
  const done: Readonly<Record<FirstStepId, boolean>> = {
    'compare-banks': facts.banksVisited,
    'open-depot': facts.depots > 0,
    transfer: purchased || facts.clearingBalances.some((balance) => balance > 0),
    'first-purchase': purchased,
    'savings-plan': facts.savingsPlans > 0,
  };
  return FIRST_STEPS.map((id) => ({ id, done: done[id] }));
}

/** Number of steps done. */
export function firstStepsDone(steps: readonly FirstStep[]): number {
  return steps.filter((step) => step.done).length;
}
