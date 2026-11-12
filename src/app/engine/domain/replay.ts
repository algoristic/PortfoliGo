import { Tick } from '@app/clock/domain/models/time.model';

import { GameEngine } from './game-engine';
import { CommandResult, GameCommand } from './models/engine-command.model';

/**
 * Replay after a restore (TS §9.2, step 3): applies the logged commands at their ticks, then runs
 * on to `targetTick`. Commands must be in log order. Commands before the current tick are already
 * contained in the snapshot and skipped; at the current tick their IDs prevent a second effect.
 * Returns the results of the commands that were applied again.
 */
export function replayCommands(
  engine: GameEngine,
  commands: readonly GameCommand[],
  targetTick: Tick,
): CommandResult[] {
  const results: CommandResult[] = [];
  for (const command of commands) {
    if (command.tick < engine.tick) {
      continue;
    }
    engine.runUntil(command.tick);
    results.push(engine.applyCommand(command));
  }
  engine.runUntil(targetTick);
  return results;
}
