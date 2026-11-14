import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { AccountId } from './account.model';

export type StandingOrderId = `so-${number}`;

/** Execution days of a standing order: 1 to 28, so every month has the day (US-BK-10). */
export const STANDING_ORDER_FIRST_DAY = 1;
export const STANDING_ORDER_LAST_DAY = 28;

/** What the player enters for a standing order (US-BK-10, TS §7.4). */
export interface StandingOrderSpec {
  fromAccountId: AccountId;
  toAccountId: AccountId;
  /** Fixed amount in whole cents ≥ 1. */
  amount: Cents;
  /** Day of the month 1–28; on a day without bank work the next bank working day. */
  day: number;
  /** Optional, at most `MAX_PURPOSE_LENGTH` characters like a transfer; stored as given. */
  purpose: string;
}

/**
 * A monthly transfer between two own accounts (US-BK-10, E-21, TS §7.4). The months up to
 * `handledUpTo` are done: executed, failed for lack of funds, or before the order was created or
 * resumed. The bank run executes the month after it on its execution day.
 */
export interface StandingOrder extends StandingOrderSpec {
  id: StandingOrderId;
  createdAt: Tick;
  paused: boolean;
  /** Month key `JJJJ-MM` (`monthKey`) of the newest month that is done. */
  handledUpTo: string;
}

/** A standing order as the UI sees it (TS §8.3): with its next execution (06:00), `null` when paused. */
export interface StandingOrderView extends StandingOrder {
  nextExecution: Tick | null;
}
