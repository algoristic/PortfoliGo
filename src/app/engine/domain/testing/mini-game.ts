import { Transaction } from '@app/banking/domain/models/ledger.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from '../game-engine';
import { createGameWorld } from '../game-world';
import { GameSnapshot, StartConditions } from '../models/game-state.model';
import { GameWorld } from '../models/game-world.model';

export const MINI_START_CONDITIONS: StartConditions = {
  startCapital: 1_000_000,
  netIncome: 280_000,
  livingCosts: 170_000,
};

export interface MiniGame {
  world: GameWorld;
  /** Snapshot right after the start (tick `GAME_START_TICK` processed). */
  start: GameSnapshot;
  /** Month start entries of the prehistory and the first tick. */
  monthStarts: readonly FactorStateEntry[];
  /** Transactions booked at the start (the opening balance). */
  journal: readonly Transaction[];
}

/** A new game on the mini world (`world/domain/testing/mini-world.ts`); call it in `beforeAll`. */
export function miniGame(seed = 'mini-1'): MiniGame {
  const { seedKey, world } = miniWorld(seed);
  const gameWorld = createGameWorld(seedKey, world);
  const engine = GameEngine.start(gameWorld, MINI_START_CONDITIONS);
  return {
    world: gameWorld,
    start: engine.snapshot(),
    monthStarts: engine.monthStartsAfter(-1),
    journal: engine.drainTransactions(),
  };
}
