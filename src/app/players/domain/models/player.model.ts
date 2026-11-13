import { Tick } from '@app/clock/domain/models/time.model';
import { StartConditions } from '@app/engine/domain/models/game-state.model';
import { Cents } from '@app/shared/domain/models/money.model';

/**
 * Profile of a player in the `players` store (TS §9.1). The UI owns it; the worker owns the clock
 * (`runtime`) and the game state (`snapshots`).
 */
export interface PlayerProfile {
  id: string;
  /** Trimmed, 1–40 characters (PS US-SP-01). */
  name: string;
  /** Normalised seed (TS §4.1); the worker derives the world from it. */
  seed: string;
  /** `deriveSeedKey(seed)` as four unsigned 32-bit words, stored as plain numbers. */
  seedKey: number[];
  start: StartConditions;
  /** `SIM_VERSION` when the profile was created (TS §15). */
  simVersion: number;
  /** Wall-clock time of the creation in milliseconds since the Unix epoch. */
  createdAt: number;
}

/** What the user enters to create a player (PS US-SP-01). */
export interface NewPlayer {
  name: string;
  seed: string;
  start: StartConditions;
}

/** Versions a game was stored with (TS §15). */
export interface StoredVersions {
  simVersion: number;
  schemaVersion: number;
}

/**
 * One row of the player selection (PS US-SP-02). The net worth comes from the worker's clock state
 * (TS §9.1); the list shows no value instead of the start capital while there is none.
 */
export interface PlayerListEntry {
  id: string;
  name: string;
  seed: string;
  /** Game time of the last stored clock; `null` while the worker has never loaded the player. */
  tick: Tick | null;
  /** Last use (wall clock, ms); `null` while the worker has never loaded the player. */
  lastSeenAt: number | null;
  /** Net worth at `tick`; missing while the worker has not stored one (never loaded, or before M3). */
  netWorth?: Cents;
  createdAt: number;
  /** Other `simVersion` or `schemaVersion` than the app: the player can only be deleted (E-25). */
  outdated: boolean;
}

export const PLAYER_PRESET_IDS = ['student', 'career-start', 'experienced'] as const;
export type PlayerPresetId = (typeof PLAYER_PRESET_IDS)[number];

export interface PlayerPreset {
  id: PlayerPresetId;
  start: StartConditions;
}

/** Codes of the checks; the `ui` layer maps them to texts. */
export type PlayerNameError = 'required' | 'too-long';
export type PlayerSeedError = 'required';
export type AmountRangeError = 'required' | 'not-whole-cents' | 'too-small' | 'too-large';
