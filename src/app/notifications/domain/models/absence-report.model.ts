import { MonthlyValues } from '@app/banking/domain/models/household.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { GameNotification } from './notification.model';

/** Level of an index at one tick; `series` as in `market/domain/series.ts`, the name is world data. */
export interface IndexLevel {
  series: number;
  id: string;
  name: string;
  level: number;
}

/** An index at the start and at the end of the period. */
export interface IndexDevelopment {
  series: number;
  id: string;
  name: string;
  start: number;
  end: number;
}

/**
 * What happened while the player was away (US-BN-03, TS §8.3 `report`): after a catch-up or while
 * the app was hidden. Executed orders and savings plans follow in M5.
 */
export interface AbsenceReport {
  /** Last tick before the period and last tick of it. */
  from: Tick;
  to: Tick;
  netWorthBefore: Cents;
  netWorthAfter: Cents;
  /** Income and expenses of the period by the categories of the monthly values (TS §7.4). */
  flows: MonthlyValues;
  /** Transactions booked in the period. */
  bookings: number;
  /** Notifications created in the period. */
  notifications: number;
  /** The newest notifications of severity warning or above, oldest first. */
  warnings: GameNotification[];
  /** All warnings of the period, also those beyond the list. */
  warningCount: number;
  indices: IndexDevelopment[];
}

/** An absence still running: what the report needs from its start and so far. */
export interface AbsenceTally {
  from: Tick;
  netWorthBefore: Cents;
  indices: IndexLevel[];
  flows: MonthlyValues;
  bookings: number;
  notifications: number;
  warnings: GameNotification[];
  warningCount: number;
}
