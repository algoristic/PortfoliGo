import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { ClosedMonth } from './models/household.model';
import {
  COST_KINDS,
  CostKind,
  ESTIMATED_COST_KINDS,
  IncomeCostsYear,
} from './models/income-costs.model';

/**
 * Earnings and costs per calendar year (US-PF-07, TS §7.4) from the monthly values: the closed
 * months and the running one, the newest year first and in it the newest month first. Earnings are
 * dividends (with fund distributions) and credit interest per month and year; costs per year are
 * order fees (with exchange fees), savings plan costs, account fees, custody fees, overdraft and
 * debit interest and the estimated spread and TER costs. The unrounded TER estimate is summed over
 * the year and rounded once.
 */
export function incomeAndCosts(
  closedMonths: readonly ClosedMonth[],
  current: ClosedMonth | null,
): IncomeCostsYear[] {
  const months = current === null ? [...closedMonths] : [...closedMonths, current];
  const years = new Map<number, ClosedMonth[]>();
  for (const entry of months) {
    const list = years.get(entry.month.year) ?? [];
    list.push(entry);
    years.set(entry.month.year, list);
  }
  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => yearOf(year, entries, current?.month.year === year));
}

function yearOf(year: number, entries: readonly ClosedMonth[], running: boolean): IncomeCostsYear {
  const sorted = [...entries].sort((a, b) => b.month.month - a.month.month);
  const costs = Object.fromEntries(COST_KINDS.map((kind) => [kind, 0])) as Record<CostKind, number>;
  let dividends = 0;
  let creditInterest = 0;
  for (const { values } of sorted) {
    dividends += values.dividends;
    creditInterest += values.creditInterest;
    for (const kind of COST_KINDS) {
      costs[kind] += values[kind];
    }
  }
  costs.terCosts = roundHalfAwayFromZero(costs.terCosts);
  const estimatedCosts = ESTIMATED_COST_KINDS.reduce((sum, kind) => sum + costs[kind], 0);
  return {
    year,
    running,
    months: sorted.map(({ month, values }) => ({
      month,
      dividends: values.dividends,
      creditInterest: values.creditInterest,
    })),
    dividends,
    creditInterest,
    costs,
    totalCosts: COST_KINDS.reduce((sum, kind) => sum + costs[kind], 0),
    estimatedCosts,
  };
}
