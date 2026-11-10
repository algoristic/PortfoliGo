/** Keys in localStorage (TS §9.3). All values are device-local display settings. */
export const LOCAL_STORAGE_KEYS = [
  'pgo.settings',
  'pgo.lastPlayerId',
  'pgo.ui.chart',
  'pgo.ui.tables',
  'pgo.backup',
] as const;
export type LocalStorageKey = (typeof LOCAL_STORAGE_KEYS)[number];

export interface VersionedEntry<T> {
  v: number;
  data: T;
}
