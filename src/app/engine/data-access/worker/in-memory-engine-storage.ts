import { Tick } from '@app/clock/domain/models/time.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';

import { candleYear, createCandleValues, patchCandleValues } from './daily-candles.utils';
import {
  DailyCandleBucket,
  DailyCandlePatch,
  EngineStorage,
  SaveSnapshotOptions,
  SNAPSHOTS_KEPT,
  StoredClock,
  StoredPlayerState,
  StoredSnapshot,
} from './engine-host.model';

export interface StoredCommand {
  playerId: string;
  command: GameCommand;
  clock: StoredClock;
}

interface PlayerRecords {
  snapshots: StoredSnapshot[];
  monthStarts: Map<number, FactorStateEntry>;
  candles: Map<string, DailyCandleBucket>;
}

/**
 * Storage in memory (lost on reload) with the semantics of `IndexedDbEngineStorage`, for tests that
 * don't need a database. It keeps no journal, so `discardAfter` has nothing to discard.
 */
export class InMemoryEngineStorage implements EngineStorage {
  readonly commands: StoredCommand[] = [];
  readonly clocks = new Map<string, StoredClock>();
  readonly #players = new Map<string, PlayerRecords>();

  async appendCommand(playerId: string, command: GameCommand, clock: StoredClock): Promise<void> {
    const stored = { playerId, command: structuredClone(command), clock: { ...clock } };
    this.clocks.set(playerId, { ...clock });
    this.commands.push(stored);
  }

  async saveClock(playerId: string, clock: StoredClock): Promise<void> {
    this.clocks.set(playerId, { ...clock });
  }

  async saveSnapshot(
    playerId: string,
    snapshot: GameSnapshot,
    options: SaveSnapshotOptions = {},
  ): Promise<void> {
    const records = this.#records(playerId);
    const stored: StoredSnapshot = {
      tick: snapshot.tick,
      schemaVersion: SCHEMA_VERSION,
      simVersion: SIM_VERSION,
      state: structuredClone(snapshot),
    };
    const snapshots = records.snapshots.filter((candidate) => candidate.tick !== snapshot.tick);
    snapshots.push(stored);
    snapshots.sort((a, b) => a.tick - b.tick);
    records.snapshots = snapshots.slice(-SNAPSHOTS_KEPT);
    this.#putMonthStarts(records, options.monthStarts ?? []);
    if (options.clock !== undefined) {
      this.clocks.set(playerId, { ...options.clock });
    }
    const oldestKeptTick = records.snapshots[0].tick;
    const kept = this.commands.filter(
      (entry) => entry.playerId !== playerId || entry.command.tick >= oldestKeptTick,
    );
    this.commands.splice(0, this.commands.length, ...kept);
  }

  async saveMonthStarts(playerId: string, entries: readonly FactorStateEntry[]): Promise<void> {
    this.#putMonthStarts(this.#records(playerId), entries);
  }

  async saveDailyCandles(playerId: string, candles: readonly DailyCandlePatch[]): Promise<void> {
    const buckets = this.#records(playerId).candles;
    for (const patch of candles) {
      const year = candleYear(patch.day);
      const id = JSON.stringify([patch.seriesId, year]);
      const bucket = buckets.get(id) ?? {
        seriesId: patch.seriesId,
        year,
        values: createCandleValues(year),
      };
      patchCandleValues(bucket.values, patch);
      buckets.set(id, bucket);
    }
  }

  async loadDailyCandles(
    playerId: string,
    seriesId: string,
    fromYear: number,
    toYear: number,
  ): Promise<DailyCandleBucket[]> {
    return Array.from(this.#players.get(playerId)?.candles.values() ?? [])
      .filter((bucket) => bucket.seriesId === seriesId)
      .filter((bucket) => bucket.year >= fromYear && bucket.year <= toYear)
      .sort((a, b) => a.year - b.year)
      .map((bucket) => structuredClone(bucket));
  }

  async clearCandles(playerId: string): Promise<void> {
    this.#players.get(playerId)?.candles.clear();
  }

  async loadPlayerState(playerId: string): Promise<StoredPlayerState> {
    const records = this.#players.get(playerId);
    const snapshot = records?.snapshots.at(-1);
    const clock = this.clocks.get(playerId);
    const fromTick = snapshot?.tick ?? -Infinity;
    const state: StoredPlayerState = {
      monthStarts: Array.from(records?.monthStarts.values() ?? [])
        .sort((a, b) => a.day - b.day)
        .map((entry) => structuredClone(entry)),
      commands: this.commands
        .filter((entry) => entry.playerId === playerId && entry.command.tick >= fromTick)
        .map((entry) => structuredClone(entry.command)),
    };
    if (clock !== undefined) {
      state.clock = { ...clock };
    }
    if (snapshot !== undefined) {
      state.snapshot = structuredClone(snapshot);
    }
    return state;
  }

  async discardAfter(_playerId: string, _tick: Tick): Promise<void> {
    // No journal in memory.
  }

  async deletePlayer(playerId: string): Promise<void> {
    this.#players.delete(playerId);
    this.clocks.delete(playerId);
    const kept = this.commands.filter((entry) => entry.playerId !== playerId);
    this.commands.splice(0, this.commands.length, ...kept);
  }

  #records(playerId: string): PlayerRecords {
    let records = this.#players.get(playerId);
    if (records === undefined) {
      records = { snapshots: [], monthStarts: new Map(), candles: new Map() };
      this.#players.set(playerId, records);
    }
    return records;
  }

  #putMonthStarts(records: PlayerRecords, entries: readonly FactorStateEntry[]): void {
    for (const entry of entries) {
      records.monthStarts.set(entry.day, structuredClone(entry));
    }
  }
}
