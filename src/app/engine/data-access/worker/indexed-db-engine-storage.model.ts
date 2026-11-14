import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { CandleResolution } from '@app/market/domain/models/candle.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import { StoredClock, StoredSnapshot } from './engine-host.model';

// Records of the stores the worker owns (TS §9.1); the key fields are in-line.

/**
 * `runtime`: clock state; its `tick` and `netWorth` are also the game time and the net worth the
 * player list shows (TS §9.1).
 */
export interface RuntimeRecord extends StoredClock {
  playerId: string;
}

/** `snapshots`, key `[playerId, tick]`. */
export interface SnapshotRecord extends StoredSnapshot {
  playerId: string;
}

/** `commands`, key `[playerId, seq]`; `seq` counts up per player in log order. */
export interface CommandRecord {
  playerId: string;
  seq: number;
  tick: Tick;
  command: GameCommand;
}

/** `marketStates`, key `[playerId, day]`: market state at a month start (E-08, TS §6.8). */
export interface MarketStateRecord {
  playerId: string;
  day: number;
  state: FactorStateEntry;
}

export type StoredCandleResolution = Extract<CandleResolution, '1d' | '1w'>;

/** `candles`, key `[playerId, instrumentId, resolution, bucket]`; `bucket` is the calendar year. */
export interface CandleRecord {
  playerId: string;
  /** Series ID (`seriesIds`): shares, indices, total return indices and ETFs. */
  instrumentId: string;
  resolution: StoredCandleResolution;
  bucket: number;
  values: Float32Array;
}

/** Common fields of the journal records (`transactions`, `orders`, `notifications`, `series`). */
export interface JournalRecord {
  playerId: string;
  /** Tick of the last change; records after the snapshot tick are discarded on restore. */
  tick: Tick;
}

/**
 * `transactions`, key `[playerId, seq]`. The multiEntry index `byAccount` runs over `accountIds`, one
 * `[playerId, accountId]` per player account the transaction books on, so a statement reads one
 * account of one player in journal order.
 */
export interface TransactionRecord extends Transaction {
  playerId: string;
  accountIds: Array<[string, AccountId]>;
}

/**
 * `notifications`, key `[playerId, seq]`: the notification as the engine created it; it never changes,
 * because its read state lives in the player state (TS §9.1).
 */
export type NotificationRecord = GameNotification & { playerId: string };

/** Name of the daily series of net worth, flows and benchmark in `series` (TS §7.9, AP 5.7). */
export const PERFORMANCE_SERIES = 'performance';

/**
 * `series`, key `[playerId, name, year]`: the points of one calendar year, ascending by day; `tick`
 * is the end of the last of them. A restore keeps the points up to the snapshot tick instead of
 * dropping the whole record (TS §9.1, §9.2).
 */
export interface SeriesRecord extends JournalRecord {
  name: typeof PERFORMANCE_SERIES;
  year: number;
  points: DailyPoint[];
}
