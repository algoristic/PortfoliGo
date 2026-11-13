import { AccountId } from '@app/banking/domain/models/account.model';
import { MonthlyValues } from '@app/banking/domain/models/household.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

/** Categories of the notification centre (PS US-BN-01, TS §12). */
export const NOTIFICATION_CATEGORIES = [
  'account',
  'order',
  'earnings',
  'taxes',
  'savings-plan',
  'system',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Severities, lowest first; warnings and above go into the absence report (US-BN-03). */
export const NOTIFICATION_SEVERITIES = ['hint', 'info', 'warning', 'critical'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/**
 * Who creates a notification: the engine from its events (stored, counted in the player state), the
 * worker host from runtime conditions, or the UI.
 */
export const NOTIFICATION_SOURCES = ['engine', 'host', 'ui'] as const;
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

/** Codes of TS §12. The engine creates the account, earnings and system codes since AP 3.6. */
export const NOTIFICATION_CODES = [
  'account-uncovered',
  'overdraft-limit-exceeded',
  'order-executed',
  'order-rejected',
  'order-expired',
  'savings-plan-executed',
  'savings-plan-failed',
  'dividend-received',
  'interest-credited',
  'tax-refund',
  'month-closed',
  'year-closed',
  'storage-quota-exceeded',
  'market-checksum-mismatch',
  'backup-reminder',
] as const;
export type NotificationCode = (typeof NOTIFICATION_CODES)[number];

/** Codes of the UI; they have no auto-pause and never reach the engine. */
export type UiNotificationCode = 'backup-reminder';
/** Codes with an auto-pause setting in the player state (TS §12). */
export type AutoPauseCode = Exclude<NotificationCode, UiNotificationCode>;

/** Defaults of a code (TS §12): toast and browser are device settings, auto-pause a player setting. */
export interface NotificationCodeInfo {
  category: NotificationCategory;
  severity: NotificationSeverity;
  source: NotificationSource;
  toast: boolean;
  browser: boolean;
  /** Auto-pause by default; `null` for UI codes, which cannot pause the game. */
  autoPause: boolean | null;
}

function info(
  category: NotificationCategory,
  severity: NotificationSeverity,
  source: NotificationSource,
  toast: boolean,
  browser: boolean,
  autoPause: boolean | null,
): NotificationCodeInfo {
  return { category, severity, source, toast, browser, autoPause };
}

/** The table of TS §12. */
export const NOTIFICATION_CODE_INFO: Readonly<Record<NotificationCode, NotificationCodeInfo>> = {
  'account-uncovered': info('account', 'warning', 'engine', true, true, false),
  'overdraft-limit-exceeded': info('account', 'critical', 'engine', true, true, true),
  'order-executed': info('order', 'info', 'engine', true, false, false),
  'order-rejected': info('order', 'warning', 'engine', true, true, false),
  'order-expired': info('order', 'info', 'engine', true, false, false),
  'savings-plan-executed': info('savings-plan', 'info', 'engine', false, false, false),
  'savings-plan-failed': info('savings-plan', 'warning', 'engine', true, true, false),
  'dividend-received': info('earnings', 'info', 'engine', false, false, false),
  'interest-credited': info('earnings', 'info', 'engine', false, false, false),
  'tax-refund': info('taxes', 'info', 'engine', false, false, false),
  'month-closed': info('system', 'info', 'engine', false, false, false),
  'year-closed': info('taxes', 'info', 'engine', true, false, false),
  'storage-quota-exceeded': info('system', 'critical', 'host', true, false, false),
  'market-checksum-mismatch': info('system', 'warning', 'host', true, false, false),
  'backup-reminder': info('system', 'hint', 'ui', true, false, null),
};

/** Codes whose auto-pause the player can switch, in the order of TS §12. */
export const AUTO_PAUSE_CODES: readonly AutoPauseCode[] = NOTIFICATION_CODES.filter(
  (code): code is AutoPauseCode => NOTIFICATION_CODE_INFO[code].autoPause !== null,
);

/** `account-uncovered`, `overdraft-limit-exceeded`: the account's balance and limit afterwards. */
export interface AccountCoverageParams {
  accountId: AccountId;
  balance: Cents;
  /** Overdraft limit; `null` for accounts without overdraft facility. */
  limit: Cents | null;
}

/** Credit interest booked on an account and the tax booked with it (refunds negative). */
export interface InterestCreditedParams {
  accountId: AccountId;
  amount: Cents;
  tax: Cents;
}

export interface TaxRefundParams {
  accountId: AccountId;
  amount: Cents;
}

/** The household values of the closed month (US-EK-03). */
export interface MonthClosedParams {
  year: number;
  month: number;
  values: MonthlyValues;
}

/** The tax year that closed (TS §7.7): its taxable income and the tax withheld net of refunds. */
export interface YearClosedParams {
  year: number;
  taxableIncome: Cents;
  taxWithheld: Cents;
}

/** Parameters of codes the engine does not create yet; their APs define them. */
export type PendingParams = Readonly<Record<string, string | number | null>>;

export interface NotificationParams {
  'account-uncovered': AccountCoverageParams;
  'overdraft-limit-exceeded': AccountCoverageParams;
  'order-executed': PendingParams;
  'order-rejected': PendingParams;
  'order-expired': PendingParams;
  'savings-plan-executed': PendingParams;
  'savings-plan-failed': PendingParams;
  'dividend-received': PendingParams;
  'interest-credited': InterestCreditedParams;
  'tax-refund': TaxRefundParams;
  'month-closed': MonthClosedParams;
  'year-closed': YearClosedParams;
  'storage-quota-exceeded': PendingParams;
  'market-checksum-mismatch': PendingParams;
  'backup-reminder': PendingParams;
}

/**
 * A notification of the engine (TS §8.6, §12): codes and numbers, never texts. `seq` counts per
 * player from 1; the record never changes after it was created (its read state lives in the player
 * state), so a restore never loses it.
 */
export type GameNotification = {
  [C in NotificationCode]: { seq: number; tick: Tick; code: C; params: NotificationParams[C] };
}[NotificationCode];

/** A notification without its running number and tick, as the engine drafts it. */
export type NotificationDraft = GameNotification extends infer N
  ? N extends unknown
    ? Omit<N, 'seq' | 'tick'>
    : never
  : never;

/**
 * Read state (TS §9.1): every notification up to `readUpTo` is read, and the ones in `readSeqs`
 * (ascending, all after `readUpTo`) as well.
 */
export interface NotificationReadState {
  readUpTo: number;
  readSeqs: number[];
}

/** Notifications in the player state (TS §9.1, §12). */
export interface NotificationState extends NotificationReadState {
  /** Running number of the next notification. */
  nextSeq: number;
  /** Auto-pause where the player differs from the default of TS §12. */
  autoPause: Partial<Record<AutoPauseCode, boolean>>;
}

/** A notification with its read state, as the query and the UI see it. */
export type NotificationEntry = GameNotification & { read: boolean };

/** `markNotificationsRead`: everything up to `upTo`, and the single notifications in `seqs`. */
export interface MarkReadRequest {
  upTo?: number;
  seqs?: readonly number[];
}

/** Errors of the notification commands (TS §8.2). */
export const NOTIFICATION_COMMAND_ERRORS = [
  /** `setAutoPause` for a code without auto-pause setting. */
  'unknown-notification-code',
  /** `markNotificationsRead` with a running number the player does not have yet. */
  'unknown-notification',
] as const;
export type NotificationCommandError = (typeof NOTIFICATION_COMMAND_ERRORS)[number];
