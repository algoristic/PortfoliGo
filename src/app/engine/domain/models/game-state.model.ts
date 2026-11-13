import { Account, AccountId, Depot } from '@app/banking/domain/models/account.model';
import { Balances } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { MarketState } from '@app/market/domain/models/market-state.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { SchedulerState } from './scheduled-task.model';

/** Behaviour while the app is hidden or closed (TS §3.6). */
export const BACKGROUND_MODES = ['realtime', 'pause'] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** Start conditions of a player (PS US-SP-01), in cents per month where periodic. */
export interface StartConditions {
  startCapital: Cents;
  netIncome: Cents;
  livingCosts: Cents;
}

/** Player state (TS §7.2); household and trading fields follow in M3 and M5. */
export interface PlayerState {
  start: StartConditions;
  /** Bank of the first current account, fixed when the game starts (TS §5.7). */
  homeBankId: string;
  backgroundMode: BackgroundMode;
  /** Accounts and depots in the order they were opened; closed ones stay. */
  accounts: Account[];
  depots: Depot[];
  /** Balances of all accounts, cached from the journal (TS §7.2). */
  balances: Balances;
  /** Current account the salary is paid into. */
  salaryAccountId: AccountId;
  /** Last value of the counter that accounts and depots share (`accountId`, `depotId`). */
  accountSequence: number;
  /** Running number of the next transaction. */
  nextTransactionSeq: number;
}

/** Dynamic state of a game (TS §8.1). Everything in it is plain, structured-cloneable data. */
export interface GameState {
  /** Last processed tick, the engine's "now". */
  tick: Tick;
  market: MarketState;
  player: PlayerState;
  scheduler: SchedulerState;
  /** IDs of the commands applied after `tick`, so that a repeated command has no effect (TS §8.5). */
  commandIds: string[];
}

/**
 * Copy of the game state for `postMessage` and IndexedDB (TS §9.2). The market states at month
 * starts are not part of it; the host stores them separately (`GameEngine.monthStartsAfter`).
 */
export type GameSnapshot = Readonly<GameState>;
