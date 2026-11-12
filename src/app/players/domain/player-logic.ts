import { StartConditions } from '@app/engine/domain/models/game-state.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { Cents } from '@app/shared/domain/models/money.model';
import { deriveSeedKey, normalizeSeed } from '@app/simulation/util/seed';

import {
  AmountRangeError,
  NewPlayer,
  PlayerListEntry,
  PlayerNameError,
  PlayerPresetId,
  PlayerProfile,
  PlayerSeedError,
  StoredVersions,
} from './models/player.model';
import {
  AmountRange,
  LIVING_COSTS_RANGE,
  NET_INCOME_RANGE,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_PRESETS,
  START_CAPITAL_RANGE,
} from './player-limits';

// Rules of the player management (PS US-SP-01, US-SP-02, TS §9.1, §15). The form uses them for
// its messages; the service applies them again before it writes.

/** Versions of this app; stored games with others are outdated (E-25). */
export const CURRENT_VERSIONS: StoredVersions = {
  simVersion: SIM_VERSION,
  schemaVersion: SCHEMA_VERSION,
};

/** The name as stored: without surrounding whitespace. */
export function normalizePlayerName(name: string): string {
  return name.trim();
}

/** 1–40 characters after trimming; characters are Unicode code points, so an emoji counts once. */
export function playerNameError(name: string): PlayerNameError | null {
  const length = [...normalizePlayerName(name)].length;
  if (length === 0) {
    return 'required';
  }
  return length > PLAYER_NAME_MAX_LENGTH ? 'too-long' : null;
}

/** The seed must not be empty after normalisation (TS §4.1). */
export function playerSeedError(seed: string): PlayerSeedError | null {
  return normalizeSeed(seed) === '' ? 'required' : null;
}

/** An amount in whole cents within the range; `null` is an empty field. */
export function amountRangeError(cents: Cents | null, range: AmountRange): AmountRangeError | null {
  if (cents === null) {
    return 'required';
  }
  if (!Number.isSafeInteger(cents)) {
    return 'not-whole-cents';
  }
  if (cents < range.min) {
    return 'too-small';
  }
  return cents > range.max ? 'too-large' : null;
}

/**
 * Living costs above the net income are allowed, but the form shows a hint (PS US-SP-01, TS §7.4).
 * Empty fields give no hint.
 */
export function livingCostsExceedIncome(
  netIncome: Cents | null,
  livingCosts: Cents | null,
): boolean {
  return netIncome !== null && livingCosts !== null && livingCosts > netIncome;
}

/** The preset whose three amounts equal the given ones, if any. */
export function matchingPreset(start: Readonly<StartConditions>): PlayerPresetId | null {
  const preset = PLAYER_PRESETS.find(
    ({ start: values }) =>
      values.startCapital === start.startCapital &&
      values.netIncome === start.netIncome &&
      values.livingCosts === start.livingCosts,
  );
  return preset?.id ?? null;
}

/**
 * A game stored with another `simVersion` (profile or snapshot) or `schemaVersion` (snapshot) is
 * outdated (TS §15, E-25). A player without a snapshot has only the profile's version.
 */
export function isOutdated(
  profile: Pick<PlayerProfile, 'simVersion'>,
  snapshot: StoredVersions | undefined,
  current: StoredVersions = CURRENT_VERSIONS,
): boolean {
  if (profile.simVersion !== current.simVersion) {
    return true;
  }
  return (
    snapshot !== undefined &&
    (snapshot.simVersion !== current.simVersion || snapshot.schemaVersion !== current.schemaVersion)
  );
}

/** The profile of a new player; throws if the input breaks a rule (the form checks it first). */
export function createPlayerProfile(
  input: NewPlayer,
  id: string,
  createdAt: number,
): PlayerProfile {
  const { startCapital, netIncome, livingCosts } = input.start;
  const problems = [
    playerNameError(input.name),
    playerSeedError(input.seed),
    amountRangeError(startCapital, START_CAPITAL_RANGE),
    amountRangeError(netIncome, NET_INCOME_RANGE),
    amountRangeError(livingCosts, LIVING_COSTS_RANGE),
  ].filter((problem) => problem !== null);
  if (problems.length > 0) {
    throw new Error(`createPlayerProfile: invalid input (${problems.join(', ')})`);
  }
  const seed = normalizeSeed(input.seed);
  return {
    id,
    name: normalizePlayerName(input.name),
    seed,
    seedKey: Array.from(deriveSeedKey(seed)),
    start: { startCapital, netIncome, livingCosts },
    simVersion: CURRENT_VERSIONS.simVersion,
    createdAt,
  };
}

/** Row of the player selection from the profile, the stored clock and the newest snapshot. */
export function toPlayerListEntry(
  profile: PlayerProfile,
  clock: { tick: number; lastSeenAt: number } | undefined,
  snapshot: StoredVersions | undefined,
  current: StoredVersions = CURRENT_VERSIONS,
): PlayerListEntry {
  return {
    id: profile.id,
    name: profile.name,
    seed: profile.seed,
    tick: clock?.tick ?? null,
    lastSeenAt: clock?.lastSeenAt ?? null,
    createdAt: profile.createdAt,
    outdated: isOutdated(profile, snapshot, current),
  };
}

/**
 * Most recently used first; a player never loaded counts as used when it was created. IDs are
 * unique and break ties.
 */
export function sortPlayerList(entries: readonly PlayerListEntry[]): PlayerListEntry[] {
  const lastUse = (entry: PlayerListEntry): number => entry.lastSeenAt ?? entry.createdAt;
  return [...entries].sort((a, b) => lastUse(b) - lastUse(a) || (a.id < b.id ? -1 : 1));
}
