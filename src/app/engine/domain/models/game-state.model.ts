import { Account, AccountId, Depot } from '@app/banking/domain/models/account.model';
import {
  AccountInflows,
  ClosedMonth,
  InterestAccrual,
  MonthlyValues,
  OverdraftLimit,
} from '@app/banking/domain/models/household.model';
import { Balances } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { MarketState } from '@app/market/domain/models/market-state.model';
import { NotificationState } from '@app/notifications/domain/models/notification.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { TaxYear } from '@app/taxes/domain/models/tax.model';
import { Order } from '@app/trading/domain/models/order.model';
import { Position } from '@app/trading/domain/models/position.model';

import { SchedulerState } from './scheduled-task.model';

/** Behaviour while the app is hidden or closed (TS §3.6). */
export const BACKGROUND_MODES = ['realtime', 'pause'] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** Start conditions of a player (PS US-SP-01), in cents per month where periodic. */
export interface StartConditions {
  startCapital: Cents;
  netIncome: Cents;
  livingCosts: Cents;
}

/** Player state (TS §7.2, §7.4, §7.5). */
export interface PlayerState {
  start: StartConditions;
  /** Bank of the first current account, fixed when the game starts (TS §5.7). */
  homeBankId: string;
  backgroundMode: BackgroundMode;
  /** Accounts and depots in the order they were opened; closed ones stay. */
  accounts: Account[];
  depots: Depot[];
  /** Balances of all accounts, cached from the journal (TS §7.2). */
  balances: Balances;
  /** Current account the salary is paid into. */
  salaryAccountId: AccountId;
  /** Last value of the counter that accounts and depots share (`accountId`, `depotId`). */
  accountSequence: number;
  /** Running number of the next transaction. */
  nextTransactionSeq: number;
  /** Limits of the open current accounts in account order, set by the bank run (TS §7.4). */
  overdraftLimits: OverdraftLimit[];
  /** External deposits per current account, closed ones included (TS §7.4). */
  inflows: AccountInflows[];
  /** Accrued interest per account in account order (TS §7.3). */
  interest: InterestAccrual[];
  /** Tax state of the current calendar year (TS §7.7). */
  taxYear: TaxYear;
  /** Household flows of the current month (TS §7.4). */
  monthlyValues: MonthlyValues;
  /** Household flows of the closed months since the game start, oldest first. */
  closedMonths: ClosedMonth[];
  /** Counter, read state and auto-pause settings of the notifications (TS §9.1, §12). */
  notifications: NotificationState;
  /** Instrument IDs of the watchlist in the player's order (US-MK-04), at most `MAX_WATCHLIST_LENGTH`. */
  watchlist: string[];
  /** Active orders (open or triggered) in placement order (TS §7.5). */
  orders: Order[];
  /** Closed orders, oldest first, at most `ORDER_HISTORY_LENGTH` (US-HD-04). */
  orderHistory: Order[];
  /** Last value of the order counter (`ord-<n>`). */
  orderSequence: number;
  /** Shares per depot and instrument, only those above 0, in order of their first purchase. */
  positions: Position[];
}

/** Dynamic state of a game (TS §8.1). Everything in it is plain, structured-cloneable data. */
export interface GameState {
  /** Last processed tick, the engine's "now". */
  tick: Tick;
  market: MarketState;
  player: PlayerState;
  scheduler: SchedulerState;
  /** IDs of the commands applied after `tick`, so that a repeated command has no effect (TS §8.5). */
  commandIds: string[];
}

/**
 * Copy of the game state for `postMessage` and IndexedDB (TS §9.2). The market states at month
 * starts are not part of it; the host stores them separately (`GameEngine.monthStartsAfter`).
 */
export type GameSnapshot = Readonly<GameState>;
