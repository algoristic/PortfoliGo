import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { GOLDEN_SEED } from '@app/market/domain/golden-master';
import { seriesIds } from '@app/market/domain/series';
import { canonicalJson } from '@app/persistence/util/canonical-json';
import { toTaggedJson } from '@app/persistence/util/tagged-json';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';
import { Checksum } from '@app/simulation/util/checksum';
import { withInexactMathTrap } from '@app/simulation/util/inexact-math-trap';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { Bank } from '@app/world/domain/models/bank.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';

/**
 * Frozen checksum of the player state after `PLAYER_SCRIPT_END` of the fixed command script on the
 * world of `GOLDEN_SEED` (TS §4.6, §15, AP 7.3c): state, journal and daily series. It covers what
 * the market golden master does not: orders, lots, savings plans, interest, taxes, fees and the
 * performance. It changes with every change of the economic rules or of the market; update it
 * only on purpose and note it in the change log (TS §15).
 */
export const PLAYER_CHECKSUM = '737578bda2ff493b0fd551fc551bea75';

/** Start conditions of the script: enough capital for a savings account above the allowance. */
export const PLAYER_SCRIPT_START: StartConditions = {
  startCapital: 15_000_000,
  netIncome: 420_000,
  livingCosts: 260_000,
};

/** Monday 03.06.2030 12:00: half of the share is sold. */
export const PLAYER_SCRIPT_SALE: Tick = dateTimeToTick({ year: 2030, month: 6, day: 3, hour: 12 });
/** Tuesday 01.10.2030 07:00: after the bank run that credits the interest of the third quarter. */
export const PLAYER_SCRIPT_END: Tick = dateTimeToTick({ year: 2030, month: 10, day: 1, hour: 7 });

/** A game command without `id` and `tick`, which the script adds. */
type CommandBody<C = GameCommand> = C extends GameCommand ? Omit<C, 'id' | 'tick'> : never;

/** What the script left behind, for the checksum and for the spec's checks of the script. */
export interface PlayerScriptRun {
  engine: GameEngine;
  results: CommandResult[];
  transactions: Transaction[];
  points: DailyPoint[];
}

/**
 * Plays the fixed script (TS §15): at the start a savings account and a depot, transfers, a market
 * buy of a share and of an ETF and a monthly savings plan on the ETF; at `PLAYER_SCRIPT_SALE` a
 * market sale of half the share; then up to `PLAYER_SCRIPT_END`. Banks and instruments are chosen
 * by rule from the world: the savings account at the bank with the highest rate (its interest
 * exceeds the saver's allowance), the depot at the first online broker, the first share and the
 * first ETF eligible for savings plans.
 */
export function runPlayerScript(world: GameWorld = goldenGameWorld()): PlayerScriptRun {
  const engine = GameEngine.start(world, PLAYER_SCRIPT_START);
  const results: CommandResult[] = [];
  let sequence = 0;
  const apply = (command: CommandBody): CommandResult => {
    sequence += 1;
    const result = engine.applyCommand({
      ...command,
      id: `golden-${sequence}`,
      tick: engine.tick,
    } as GameCommand);
    results.push(result);
    return result;
  };

  const banks = world.world.banks;
  let savingsBank: Bank | undefined;
  for (const bank of banks) {
    const rate = bank.conditions.savingsAccount?.rate ?? -1;
    if (rate > (savingsBank?.conditions.savingsAccount?.rate ?? -1)) {
      savingsBank = bank;
    }
  }
  const broker = banks.find(({ type }) => type === 'online-broker');
  const etf = world.world.etfs.find(({ savingsPlanEligible }) => savingsPlanEligible);
  const share = seriesIds(world.context)[0];
  if (savingsBank === undefined || broker === undefined || etf === undefined) {
    throw new Error('runPlayerScript: the world lacks a savings bank, a broker or an ETF');
  }
  const savings = openedAccount(
    apply({ type: 'openAccount', bankId: savingsBank.id, kind: 'savings' }),
  );
  const depot = openedAccount(apply({ type: 'openAccount', bankId: broker.id, kind: 'depot' }));
  const salary = engine.player.salaryAccountId;
  apply({
    type: 'transfer',
    fromAccountId: salary,
    toAccountId: savings.accountId,
    amount: 10_000_000,
    purpose: 'Tagesgeld',
  });
  apply({
    type: 'transfer',
    fromAccountId: salary,
    toAccountId: depot.accountId,
    amount: 4_000_000,
    purpose: 'Depot',
  });
  const depotId = depot.depotId as DepotId;
  for (const [instrumentId, amount] of [
    [share, 1_500_000],
    [etf.id, 1_000_000],
  ] as const) {
    apply({
      type: 'placeOrder',
      order: {
        depotId,
        instrumentId,
        side: 'buy',
        type: 'market',
        size: { kind: 'amount', amount },
        limit: null,
        stop: null,
        validity: { kind: 'gtc' },
      },
    });
  }
  apply({
    type: 'createSavingsPlan',
    plan: { depotId, instrumentId: etf.id, amount: 50_000, day: 15 },
  });

  engine.runUntil(PLAYER_SCRIPT_SALE);
  const position = engine.player.positions.find(
    (entry) => entry.depotId === depotId && entry.instrumentId === share,
  );
  apply({
    type: 'placeOrder',
    order: {
      depotId,
      instrumentId: share,
      side: 'sell',
      type: 'market',
      size: { kind: 'quantity', quantity: Math.floor((position?.quantity ?? 0) / 2) },
      limit: null,
      stop: null,
      validity: { kind: 'gtc' },
    },
  });
  engine.runUntil(PLAYER_SCRIPT_END);
  return {
    engine,
    results,
    transactions: engine.drainTransactions(),
    points: engine.drainDailyPoints(),
  };
}

/** Checksum over tick, player state, journal and daily series of a run (canonical JSON). */
export function playerChecksum(run: PlayerScriptRun): string {
  const text = canonicalJson(
    toTaggedJson({
      tick: run.engine.tick,
      results: run.results,
      player: run.engine.player,
      transactions: run.transactions,
      points: run.points,
    }),
  );
  const checksum = new Checksum();
  for (let i = 0; i < text.length; i++) {
    checksum.addUint32(text.charCodeAt(i));
  }
  return checksum.digest();
}

/**
 * Runs the script on the golden world and returns its checksum. Runs in the lab worker for the
 * self-test (TS §14.2), so it stays framework-free; the inexact `Math` functions throw meanwhile.
 */
export function computePlayerChecksum(): string {
  return withInexactMathTrap(() => playerChecksum(runPlayerScript()));
}

function goldenGameWorld(): GameWorld {
  const seedKey = deriveSeedKey(GOLDEN_SEED);
  return createGameWorld(seedKey, generateWorld(seedKey));
}

function openedAccount(result: CommandResult): { accountId: AccountId; depotId: DepotId | null } {
  if (!result.ok || result.opened === undefined) {
    throw new Error('runPlayerScript: an account could not be opened');
  }
  return result.opened;
}
