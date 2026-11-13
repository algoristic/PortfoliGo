import { annualizedVolatility, beta, logReturns } from '@app/analysis/domain/statistics-logic';
import { DividendSchedule } from '@app/world/domain/models/company.model';
import { DividendFrequency, RegionId, SectorId } from '@app/world/domain/models/taxonomy.model';

import { exDayOnOrAfter } from './dividend-logic';
import {
  CompositionPosition,
  CompositionShare,
  DividendPayment,
  IndexComposition,
} from './models/instrument-figures.model';
import { marketDayOnOrBefore, marketDaysEndingAt, monthsBackDay } from './performance-logic';

/** Daily log returns in the window of volatility and beta (TS §8.2, decided 13.11.2026). */
export const FIGURE_RETURNS = 252;
/** Market days per year for annualising the daily volatility (× √252). */
export const FIGURE_DAYS_PER_YEAR = 252;
/** Months of dividend history on the instrument page. */
export const DIVIDEND_HISTORY_MONTHS = 60;
export const MAX_DIVIDEND_HISTORY = 40;
/** Largest positions of an index composition. */
export const MAX_TOP_POSITIONS = 10;

/**
 * Market days of the closes behind volatility and beta at `today`: the `FIGURE_RETURNS + 1`
 * market days ending with the last market day before `today`, oldest first; `null` if the window
 * would reach before the epoch. The window moves once per market day.
 */
export function figureWindowDays(today: number): number[] | null {
  const days = marketDaysEndingAt(marketDayOnOrBefore(today - 1), FIGURE_RETURNS + 1);
  return days.length === FIGURE_RETURNS + 1 ? days : null;
}

/** Annualised volatility of the daily log returns of a full window of closes, else `null`. */
export function windowVolatility(closes: ArrayLike<number>): number | null {
  if (closes.length !== FIGURE_RETURNS + 1) {
    return null;
  }
  return finiteOrNull(annualizedVolatility(logReturns(closes), FIGURE_DAYS_PER_YEAR));
}

/** Beta of the daily log returns of `closes` against those of `benchmark` (full windows only). */
export function windowBeta(closes: ArrayLike<number>, benchmark: ArrayLike<number>): number | null {
  if (closes.length !== FIGURE_RETURNS + 1 || benchmark.length !== FIGURE_RETURNS + 1) {
    return null;
  }
  return finiteOrNull(beta(logReturns(closes), logReturns(benchmark)));
}

/** First day whose ex-dates belong to the dividend history at `today` (five years back). */
export function dividendHistoryStart(today: number): number {
  return Math.max(0, monthsBackDay(today, DIVIDEND_HISTORY_MONTHS) + 1);
}

/** Ex-dates of the fixed rhythm in `[fromDay, toDay]`, ascending (TS §5.4, §6.5). */
export function scheduledExDays(
  schedule: DividendSchedule,
  frequency: DividendFrequency,
  fromDay: number,
  toDay: number,
): number[] {
  const days: number[] = [];
  for (
    let day = exDayOnOrAfter(schedule, frequency, fromDay);
    day <= toDay;
    day = exDayOnOrAfter(schedule, frequency, day + 1)
  ) {
    days.push(day);
  }
  return days;
}

/** Paid amounts newest first, without empty payments, at most `MAX_DIVIDEND_HISTORY`. */
export function dividendHistory(payments: readonly DividendPayment[]): DividendPayment[] {
  return payments
    .filter(({ cents }) => cents > 0)
    .sort((a, b) => b.exDay - a.exDay)
    .slice(0, MAX_DIVIDEND_HISTORY);
}

/** A constituent with its index value `n_i · P_i` (capped free-float shares × close). */
export interface CompositionMember {
  id: string;
  series: number;
  name: string;
  regionId: RegionId;
  sectorId: SectorId;
  value: number;
}

/**
 * Weights of the constituents (in constituent order) as shares of the index value: the largest
 * positions, and the weights summed per region and sector, each descending.
 */
export function indexComposition(
  indexId: string,
  members: readonly CompositionMember[],
): IndexComposition {
  let total = 0;
  for (const { value } of members) {
    total += value;
  }
  const weighted = members.map((member) => ({ ...member, weight: member.value / total }));
  const top: CompositionPosition[] = weighted
    .map((member, order) => ({ member, order }))
    .sort((a, b) => b.member.weight - a.member.weight || a.order - b.order)
    .slice(0, MAX_TOP_POSITIONS)
    .map(({ member: { id, series, name, weight } }) => ({ id, series, name, weight }));
  return {
    indexId,
    constituentCount: members.length,
    top,
    regions: sharesBy(weighted, ({ regionId }) => regionId),
    sectors: sharesBy(weighted, ({ sectorId }) => sectorId),
  };
}

function sharesBy<T extends string>(
  members: readonly (CompositionMember & { weight: number })[],
  key: (member: CompositionMember) => T,
): CompositionShare<T>[] {
  const sums = new Map<T, number>();
  for (const member of members) {
    sums.set(key(member), (sums.get(key(member)) ?? 0) + member.weight);
  }
  return [...sums]
    .map(([group, weight]) => ({ key: group, weight }))
    .sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1));
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
