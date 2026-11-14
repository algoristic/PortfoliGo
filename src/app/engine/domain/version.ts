// Versions of the stored game (TS §15, E-25). Before 1.0, a player whose profile or snapshot carries
// another version is outdated and can only be deleted.

/** World and market generation: raise it whenever a golden master changes. */
export const SIM_VERSION = 1;

/**
 * Structure of the stored game state (snapshots, month starts, journal): raise it on every change.
 * 2: accounts, balances and the journal (AP 3.1). 3: limits, inflows, accrued interest, tax year and
 * monthly values (AP 3.2). 4: notification counter, read state and auto-pause settings (AP 3.6).
 * 5: watchlist (AP 4.4). 6: orders, lots, distributions, custody fees, tax years, standing orders,
 * savings plans, daily series and the new monthly values (M5). 7: background speed and deadline
 * (AP 6.7).
 */
export const SCHEMA_VERSION = 7;
