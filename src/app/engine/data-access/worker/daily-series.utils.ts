import { dayStartTick, tickToDateTime } from '@app/clock/domain/calendar-logic';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

/** Calendar year of a day, the year record of its point in `series` (TS §9.1). */
export function pointYear(day: number): number {
  return tickToDateTime(dayStartTick(day)).year;
}

/** Groups points by their calendar year, in the order of the years. */
export function pointsByYear(points: readonly DailyPoint[]): Map<number, DailyPoint[]> {
  const years = new Map<number, DailyPoint[]>();
  for (const point of points) {
    const year = pointYear(point.day);
    const list = years.get(year) ?? [];
    list.push(point);
    years.set(year, list);
  }
  return years;
}

/** Stored points with the added ones; an added point replaces a stored one of the same day. */
export function mergePoints(
  stored: readonly DailyPoint[],
  added: readonly DailyPoint[],
): DailyPoint[] {
  const byDay = new Map<number, DailyPoint>();
  for (const point of [...stored, ...added]) {
    byDay.set(point.day, point);
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}
