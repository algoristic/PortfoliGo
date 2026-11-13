import { PostingDraft } from '@app/banking/domain/models/ledger.model';
import { addToMonthlyValues, emptyMonthlyValues } from '@app/banking/domain/monthly-values-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { MarketIndex } from '@app/world/domain/models/market-index.model';

import { AbsenceReport, AbsenceTally, IndexLevel } from './models/absence-report.model';
import {
  GameNotification,
  NOTIFICATION_CODE_INFO,
  NOTIFICATION_SEVERITIES,
  NotificationCode,
} from './models/notification.model';

/** Warnings listed in a report; the report counts the others. */
export const MAX_REPORT_WARNINGS = 50;

const WARNING_RANK = NOTIFICATION_SEVERITIES.indexOf('warning');

/** Severity warning or critical: these go into the absence report (US-BN-03). */
export function isWarning(code: NotificationCode): boolean {
  return NOTIFICATION_SEVERITIES.indexOf(NOTIFICATION_CODE_INFO[code].severity) >= WARNING_RANK;
}

/**
 * Indices of the report (positions in the world's index list): the world indices, then the broad
 * index of every region, in world order.
 */
export function reportIndices(indices: readonly MarketIndex[]): number[] {
  const positions = indices.map((index, x) => ({ kind: index.kind, x }));
  return [
    ...positions.filter(({ kind }) => kind === 'world'),
    ...positions.filter(({ kind }) => kind === 'region-broad'),
  ].map(({ x }) => x);
}

/** Starts an absence after tick `from` with the net worth and index levels then. */
export function openAbsence(
  from: Tick,
  netWorthBefore: Cents,
  indices: readonly IndexLevel[],
): AbsenceTally {
  return {
    from,
    netWorthBefore,
    indices: indices.map((level) => ({ ...level })),
    flows: emptyMonthlyValues(),
    bookings: 0,
    notifications: 0,
    warnings: [],
    warningCount: 0,
  };
}

/** Adds booked transactions: their household flows by monthly value category (TS §7.4). */
export function tallyBookings(
  tally: Readonly<AbsenceTally>,
  transactions: readonly { postings: readonly PostingDraft[] }[],
): AbsenceTally {
  let flows = tally.flows;
  for (const transaction of transactions) {
    flows = addToMonthlyValues(flows, transaction);
  }
  return { ...tally, flows, bookings: tally.bookings + transactions.length };
}

/** Adds notifications; warnings and above are listed, the newest `MAX_REPORT_WARNINGS` of them. */
export function tallyNotifications(
  tally: Readonly<AbsenceTally>,
  notifications: readonly GameNotification[],
): AbsenceTally {
  const warnings = notifications.filter(({ code }) => isWarning(code));
  return {
    ...tally,
    notifications: tally.notifications + notifications.length,
    warnings: [...tally.warnings, ...warnings].slice(-MAX_REPORT_WARNINGS),
    warningCount: tally.warningCount + warnings.length,
  };
}

/**
 * The report of an absence that ended at tick `to`; `null` when nothing was booked or notified in
 * it. `indices` holds the levels at `to` of the indices the absence started with (matched by series).
 */
export function closeAbsence(
  tally: Readonly<AbsenceTally>,
  to: Tick,
  netWorthAfter: Cents,
  indices: readonly IndexLevel[],
): AbsenceReport | null {
  if (tally.bookings === 0 && tally.notifications === 0) {
    return null;
  }
  const end = new Map(indices.map((level) => [level.series, level.level]));
  return {
    from: tally.from,
    to,
    netWorthBefore: tally.netWorthBefore,
    netWorthAfter,
    flows: { ...tally.flows },
    bookings: tally.bookings,
    notifications: tally.notifications,
    warnings: tally.warnings,
    warningCount: tally.warningCount,
    indices: tally.indices.flatMap(({ series, id, name, level }) => {
      const last = end.get(series);
      return last === undefined ? [] : [{ series, id, name, start: level, end: last }];
    }),
  };
}
