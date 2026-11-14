import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import {
  CandleConsolidationResult,
  DailyCandleBucket,
  DailyCandlePatch,
  EngineStorage,
  SaveSnapshotOptions,
  StoredClock,
  StoredPlayerState,
  WeeklyCandleBucket,
} from '../worker/engine-host.model';

/** `fail`: only the n-th write fails. `crash`: the n-th write and every later one fail. */
export type FaultMode = 'fail' | 'crash';

export interface FaultOptions {
  /** 1-based number of the write that fails; writes are counted over all write methods. */
  failAt: number;
  mode: FaultMode;
}

export class InjectedStorageFault extends Error {
  constructor(readonly write: number) {
    super(`injected storage fault at write ${write}`);
  }
}

/**
 * Wraps a real storage port and makes writes fail (TS §14.1, crash property of AP 2.3). A failing
 * write never reaches the wrapped port, like a transaction that did not commit. After a crash,
 * recover with a new host on `inner`. Reads always pass through.
 */
export class FaultyEngineStorage implements EngineStorage {
  readonly inner: EngineStorage;
  readonly #options: FaultOptions;
  #writes = 0;
  #crashed = false;

  constructor(inner: EngineStorage, options: FaultOptions) {
    this.inner = inner;
    this.#options = options;
  }

  /** Writes attempted so far, failed ones included. */
  get writes(): number {
    return this.#writes;
  }

  get crashed(): boolean {
    return this.#crashed;
  }

  appendCommand(playerId: string, command: GameCommand, clock: StoredClock): Promise<void> {
    return this.#write(() => this.inner.appendCommand(playerId, command, clock));
  }

  saveClock(playerId: string, clock: StoredClock): Promise<void> {
    return this.#write(() => this.inner.saveClock(playerId, clock));
  }

  saveSnapshot(
    playerId: string,
    snapshot: GameSnapshot,
    options?: SaveSnapshotOptions,
  ): Promise<void> {
    return this.#write(() => this.inner.saveSnapshot(playerId, snapshot, options));
  }

  saveTransactions(playerId: string, transactions: readonly Transaction[]): Promise<void> {
    return this.#write(() => this.inner.saveTransactions(playerId, transactions));
  }

  loadTransactions(playerId: string, accountId?: AccountId): Promise<Transaction[]> {
    return this.inner.loadTransactions(playerId, accountId);
  }

  saveNotifications(playerId: string, notifications: readonly GameNotification[]): Promise<void> {
    return this.#write(() => this.inner.saveNotifications(playerId, notifications));
  }

  loadNotifications(playerId: string): Promise<GameNotification[]> {
    return this.inner.loadNotifications(playerId);
  }

  saveMonthStarts(playerId: string, entries: readonly FactorStateEntry[]): Promise<void> {
    return this.#write(() => this.inner.saveMonthStarts(playerId, entries));
  }

  saveDailyCandles(playerId: string, candles: readonly DailyCandlePatch[]): Promise<void> {
    return this.#write(() => this.inner.saveDailyCandles(playerId, candles));
  }

  loadDailyCandles(
    playerId: string,
    seriesId: string,
    fromYear: number,
    toYear: number,
  ): Promise<DailyCandleBucket[]> {
    return this.inner.loadDailyCandles(playerId, seriesId, fromYear, toYear);
  }

  loadWeeklyCandles(
    playerId: string,
    seriesId: string,
    fromYear: number,
    toYear: number,
  ): Promise<WeeklyCandleBucket[]> {
    return this.inner.loadWeeklyCandles(playerId, seriesId, fromYear, toYear);
  }

  consolidateCandles(
    playerId: string,
    seriesIds: readonly string[],
    year: number,
  ): Promise<CandleConsolidationResult> {
    return this.#write(() => this.inner.consolidateCandles(playerId, seriesIds, year));
  }

  saveDailyPoints(playerId: string, points: readonly DailyPoint[]): Promise<void> {
    return this.#write(() => this.inner.saveDailyPoints(playerId, points));
  }

  loadDailyPoints(playerId: string, fromDay: number, toDay: number): Promise<DailyPoint[]> {
    return this.inner.loadDailyPoints(playerId, fromDay, toDay);
  }

  clearCandles(playerId: string): Promise<void> {
    return this.#write(() => this.inner.clearCandles(playerId));
  }

  loadPlayerState(playerId: string): Promise<StoredPlayerState> {
    return this.inner.loadPlayerState(playerId);
  }

  discardAfter(playerId: string, tick: Tick): Promise<void> {
    return this.#write(() => this.inner.discardAfter(playerId, tick));
  }

  deletePlayer(playerId: string): Promise<void> {
    return this.#write(() => this.inner.deletePlayer(playerId));
  }

  async #write<T>(write: () => Promise<T>): Promise<T> {
    const number = ++this.#writes;
    const { failAt, mode } = this.#options;
    if (number === failAt && mode === 'crash') {
      this.#crashed = true;
    }
    if (number === failAt || this.#crashed) {
      throw new InjectedStorageFault(number);
    }
    return write();
  }
}
