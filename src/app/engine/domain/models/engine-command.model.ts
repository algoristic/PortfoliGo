import { AccountId, DepotId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { BANK_COMMAND_ERRORS } from '@app/banking/domain/models/bank-command.model';
import {
  StandingOrderId,
  StandingOrderSpec,
} from '@app/banking/domain/models/standing-order.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { WATCHLIST_COMMAND_ERRORS } from '@app/market/domain/models/watchlist.model';
import {
  AutoPauseCode,
  NOTIFICATION_COMMAND_ERRORS,
} from '@app/notifications/domain/models/notification.model';
import { Cents } from '@app/shared/domain/models/money.model';
import {
  ORDER_COMMAND_ERRORS,
  OrderChange,
  OrderSpec,
} from '@app/trading/domain/models/order.model';
import {
  SAVINGS_PLAN_COMMAND_ERRORS,
  SavingsPlanChange,
  SavingsPlanId,
  SavingsPlanSpec,
} from '@app/trading/domain/models/savings-plan.model';

import { BackgroundMode, BackgroundPauseAfter } from './game-state.model';

/**
 * Game commands (TS §8.2) carry the tick after which they take effect: a command with tick T
 * acts after tick T and before T + 1 (TS §3.8, §8.5).
 */
interface CommandBase {
  id: string;
  tick: Tick;
}

/**
 * Sets the behaviour in the background (TS §3.6). `speed` (`backgroundSpeed`) and `pauseAfter`
 * (`backgroundPauseAfter`) are optional; a missing one keeps its current value.
 */
export interface SetBackgroundModeCommand extends CommandBase {
  type: 'setBackgroundMode';
  mode: BackgroundMode;
  speed?: SpeedId;
  pauseAfter?: BackgroundPauseAfter;
}

/** Opens an account; `depot` opens a depot with its clearing account (US-BK-02). */
export interface OpenAccountCommand extends CommandBase {
  type: 'openAccount';
  bankId: string;
  kind: OpenableAccountKind;
}

/** Closes an account; a remainder goes to `targetAccountId` (US-BK-03, TS §7.4). */
export interface CloseAccountCommand extends CommandBase {
  type: 'closeAccount';
  accountId: AccountId;
  targetAccountId?: AccountId;
}

export interface SetSalaryAccountCommand extends CommandBase {
  type: 'setSalaryAccount';
  accountId: AccountId;
}

/** Own transfer (US-BK-04); `purpose` is the user's text, stored as given. */
export interface TransferCommand extends CommandBase {
  type: 'transfer';
  fromAccountId: AccountId;
  toAccountId: AccountId;
  amount: Cents;
  purpose: string;
}

/** Creates a standing order (US-BK-10, TS §7.4); the result carries its ID. */
export interface CreateStandingOrderCommand extends CommandBase {
  type: 'createStandingOrder';
  order: StandingOrderSpec;
}

/** Replaces accounts, amount, day and purpose of a standing order. */
export interface ChangeStandingOrderCommand extends CommandBase {
  type: 'changeStandingOrder';
  standingOrderId: StandingOrderId;
  order: StandingOrderSpec;
}

/** Pauses or resumes a standing order. */
export interface SetStandingOrderPausedCommand extends CommandBase {
  type: 'setStandingOrderPaused';
  standingOrderId: StandingOrderId;
  paused: boolean;
}

export interface DeleteStandingOrderCommand extends CommandBase {
  type: 'deleteStandingOrder';
  standingOrderId: StandingOrderId;
}

/** Auto-pause of a notification code (TS §12, US-ZT-06). */
export interface SetAutoPauseCommand extends CommandBase {
  type: 'setAutoPause';
  code: AutoPauseCode;
  enabled: boolean;
}

/** Marks notifications as read: all up to `upTo` and the single ones in `seqs` (US-BN-01). */
export interface MarkNotificationsReadCommand extends CommandBase {
  type: 'markNotificationsRead';
  upTo?: number;
  seqs?: number[];
}

/** Replaces the watchlist with `ids` in this order: adds, removes and reorders (US-MK-04). */
export interface UpdateWatchlistCommand extends CommandBase {
  type: 'updateWatchlist';
  ids: string[];
}

/** Places an order (US-HD-01–03, TS §7.5); the result carries its ID. */
export interface PlaceOrderCommand extends CommandBase {
  type: 'placeOrder';
  order: OrderSpec;
}

/** Changes limit, stop or validity of an active order (US-HD-04). */
export interface ChangeOrderCommand extends CommandBase {
  type: 'changeOrder';
  orderId: string;
  change: OrderChange;
}

/** Cancels an active order (US-HD-04). */
export interface CancelOrderCommand extends CommandBase {
  type: 'cancelOrder';
  orderId: string;
}

/** Creates a savings plan (US-HD-05, TS §7.8); the result carries its ID. */
export interface CreateSavingsPlanCommand extends CommandBase {
  type: 'createSavingsPlan';
  plan: SavingsPlanSpec;
}

/** Replaces amount and day of a savings plan; depot and instrument stay. */
export interface ChangeSavingsPlanCommand extends CommandBase {
  type: 'changeSavingsPlan';
  savingsPlanId: SavingsPlanId;
  change: SavingsPlanChange;
}

/** Pauses or resumes a savings plan. */
export interface SetSavingsPlanPausedCommand extends CommandBase {
  type: 'setSavingsPlanPaused';
  savingsPlanId: SavingsPlanId;
  paused: boolean;
}

export interface DeleteSavingsPlanCommand extends CommandBase {
  type: 'deleteSavingsPlan';
  savingsPlanId: SavingsPlanId;
}

export type GameCommand =
  | SetBackgroundModeCommand
  | SetAutoPauseCommand
  | MarkNotificationsReadCommand
  | UpdateWatchlistCommand
  | OpenAccountCommand
  | CloseAccountCommand
  | SetSalaryAccountCommand
  | TransferCommand
  | CreateStandingOrderCommand
  | ChangeStandingOrderCommand
  | SetStandingOrderPausedCommand
  | DeleteStandingOrderCommand
  | PlaceOrderCommand
  | ChangeOrderCommand
  | CancelOrderCommand
  | CreateSavingsPlanCommand
  | ChangeSavingsPlanCommand
  | SetSavingsPlanPausedCommand
  | DeleteSavingsPlanCommand;

export const COMMAND_ERRORS = [
  'tick-mismatch',
  'invalid-command',
  ...BANK_COMMAND_ERRORS,
  ...NOTIFICATION_COMMAND_ERRORS,
  ...WATCHLIST_COMMAND_ERRORS,
  ...ORDER_COMMAND_ERRORS,
  ...SAVINGS_PLAN_COMMAND_ERRORS,
] as const;
export type CommandError = (typeof COMMAND_ERRORS)[number];

/** The account that `openAccount` opened; `depotId` only for a depot. */
export interface OpenedAccount {
  accountId: AccountId;
  depotId: DepotId | null;
}

/**
 * `opened` answers `openAccount`, `orderId` answers `placeOrder`, `standingOrderId` answers
 * `createStandingOrder`, `savingsPlanId` answers `createSavingsPlan`.
 */
export type CommandResult =
  | {
      ok: true;
      opened?: OpenedAccount;
      orderId?: string;
      standingOrderId?: StandingOrderId;
      savingsPlanId?: SavingsPlanId;
    }
  | { ok: false; error: CommandError };
