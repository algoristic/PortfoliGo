import { AccountId, DepotId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { BANK_COMMAND_ERRORS } from '@app/banking/domain/models/bank-command.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { WATCHLIST_COMMAND_ERRORS } from '@app/market/domain/models/watchlist.model';
import {
  AutoPauseCode,
  NOTIFICATION_COMMAND_ERRORS,
} from '@app/notifications/domain/models/notification.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { BackgroundMode } from './game-state.model';

/**
 * Game commands (TS §8.2) carry the tick after which they take effect: a command with tick T
 * acts after tick T and before T + 1 (TS §3.8, §8.5).
 */
interface CommandBase {
  id: string;
  tick: Tick;
}

export interface SetBackgroundModeCommand extends CommandBase {
  type: 'setBackgroundMode';
  mode: BackgroundMode;
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

export type GameCommand =
  | SetBackgroundModeCommand
  | SetAutoPauseCommand
  | MarkNotificationsReadCommand
  | UpdateWatchlistCommand
  | OpenAccountCommand
  | CloseAccountCommand
  | SetSalaryAccountCommand
  | TransferCommand;

export const COMMAND_ERRORS = [
  'tick-mismatch',
  'invalid-command',
  ...BANK_COMMAND_ERRORS,
  ...NOTIFICATION_COMMAND_ERRORS,
  ...WATCHLIST_COMMAND_ERRORS,
] as const;
export type CommandError = (typeof COMMAND_ERRORS)[number];

/** The account that `openAccount` opened; `depotId` only for a depot. */
export interface OpenedAccount {
  accountId: AccountId;
  depotId: DepotId | null;
}

export type CommandResult =
  { ok: true; opened?: OpenedAccount } | { ok: false; error: CommandError };
