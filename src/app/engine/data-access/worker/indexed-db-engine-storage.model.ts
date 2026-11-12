import { Tick } from '@app/clock/domain/models/time.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { CandleResolution } from '@app/market/domain/models/candle.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';

import { StoredClock, StoredSnapshot } from './engine-host.model';

// Records of the stores the worker owns (TS §9.1); the key fields are in-line.

/** `runtime`: clock state; its `tick` is also the game time the player list shows. */
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
