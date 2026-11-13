import { Cents } from '@app/shared/domain/models/money.model';

/**
 * Kinds of scheduled tasks in their fixed order within one tick (TS §3.8, §8.1). Order expiry is
 * reserved for M5; its rank is fixed already.
 */
export const TASK_ORDER = [
  'day-change',
  'bank-run',
  'session-open',
  'session-close',
  'order-expiry',
  'month-end',
  'year-end',
] as const;
export type TaskKind = (typeof TASK_ORDER)[number];

/** Ex-date of a share or a distributing ETF, reported at the open of its exchange (TS §6.5). */
export interface ExDividend {
  series: number;
  /** Dividend or distribution per share in cents. */
  cents: Cents;
  /** Day index of the payment date (ex-date plus two bank working days). */
  paymentDay: number;
}

/** Order expiry is reserved for M5; the engine does not schedule it yet. */
export type TaskSpec =
  | { kind: 'day-change' }
  | { kind: 'bank-run' }
  | { kind: 'session-open'; exchange: number; dividends: readonly ExDividend[] }
  | { kind: 'session-close'; exchange: number }
  | { kind: 'order-expiry' }
  | { kind: 'month-end' }
  | { kind: 'year-end' };

/** A task in the scheduler; never changed after it was scheduled. */
export type ScheduledTask = TaskSpec & {
  tick: number;
  /** Insertion sequence; breaks ties between tasks of the same tick and kind. */
  seq: number;
};

/** Binary min-heap ordered by (tick, rank of the kind, sequence). */
export interface SchedulerState {
  heap: ScheduledTask[];
  nextSeq: number;
}
