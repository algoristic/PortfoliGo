// Versions of the stored game (TS §15, E-25). Before 1.0, a player whose profile or snapshot carries
// another version is outdated and can only be deleted.

/** World and market generation: raise it whenever a golden master changes. */
export const SIM_VERSION = 1;

/** Structure of the stored game state (snapshots, month starts): raise it on every change. */
export const SCHEMA_VERSION = 1;
