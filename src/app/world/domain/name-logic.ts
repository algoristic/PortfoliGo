import { NAME_BLOCKLIST } from './names/name-blocklist';

import { CORE_ENDINGS, CORE_STARTS } from './names/name-parts';

import { pick } from '../../simulation/util/distributions';
import { RandomStream } from '../../simulation/util/random-stream';

/** Entries of at least this length also match word starts and words written together. */
const LONG_ENTRY_MIN_LENGTH = 5;
const MAX_ATTEMPTS = 2000;

const BLOCKLIST_LONG = NAME_BLOCKLIST.filter((entry) => entry.length >= LONG_ENTRY_MIN_LENGTH);
const BLOCKLIST_TOKENS = new Set(
  NAME_BLOCKLIST.filter((entry) => entry.length < LONG_ENTRY_MIN_LENGTH),
);

function nameTokens(name: string): string[] {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Dots belong to abbreviations ("N.V.", "S.A."), so they do not split words.
      .replace(/\./g, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0)
  );
}

/** A long entry matches the start of a word ("Siemensbank") or consecutive whole words ("Deutsche Bank"). */
function matchesLongEntry(tokens: readonly string[], entry: string): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startsWith(entry)) {
      return true;
    }
    let joined = tokens[i];
    for (let j = i + 1; j < tokens.length && joined.length < entry.length; j++) {
      joined += tokens[j];
      if (joined === entry) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether a name resembles a blocklisted real name. Short entries must match a whole word; longer
 * entries also match the start of a word or several words written together.
 */
export function isBlockedName(name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.some((token) => BLOCKLIST_TOKENS.has(token))) {
    return true;
  }
  return BLOCKLIST_LONG.some((entry) => matchesLongEntry(tokens, entry));
}

/**
 * Hands out fictional names. Every core (e.g. `Velora`) is used at most once per world, so all
 * names differ in their distinctive part; names on the blocklist are skipped.
 */
export class NameRegistry {
  readonly #usedCores = new Set<string>();
  readonly #usedNames = new Set<string>();

  /** Draws an unused core and builds the name; `build` must contain the core. */
  next(rng: RandomStream, build: (core: string) => string): { core: string; name: string } {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const core = pick(rng, CORE_STARTS) + pick(rng, CORE_ENDINGS);
      const key = core.toLowerCase();
      if (this.#usedCores.has(key)) {
        continue;
      }
      const name = build(core);
      if (this.#usedNames.has(name.toLowerCase()) || isBlockedName(name)) {
        continue;
      }
      this.#usedCores.add(key);
      this.#usedNames.add(name.toLowerCase());
      return { core, name };
    }
    throw new Error('NameRegistry: no free name found');
  }

  /** Registers a name that is not built from a fresh core (e.g. ETF names). */
  claim(name: string): boolean {
    const key = name.toLowerCase();
    if (this.#usedNames.has(key) || isBlockedName(name)) {
      return false;
    }
    this.#usedNames.add(key);
    return true;
  }
}

export function fillPattern(pattern: string, core: string): string {
  return pattern.replace('{core}', core);
}
