/**
 * Keys in localStorage (TS §9.3). All values are device-local display settings, except
 * `pgo.lastTick`, the UI's lower bound for loading a player (E-08).
 */
export const LOCAL_STORAGE_KEYS = [
  'pgo.settings',
  'pgo.lastPlayerId',
  'pgo.lastTick',
  'pgo.ui.chart',
  'pgo.ui.tables',
  'pgo.backup',
] as const;
export type LocalStorageKey = (typeof LOCAL_STORAGE_KEYS)[number];

export interface VersionedEntry<T> {
  v: number;
  data: T;
}
