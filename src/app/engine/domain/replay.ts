import { Tick } from '@app/clock/domain/models/time.model';

import { GameEngine } from './game-engine';
import { CommandResult, GameCommand } from './models/engine-command.model';

/**
 * Replay after a restore (TS §9.2, step 3): applies the logged commands at their ticks, then runs
 * on to `targetTick`. Commands must be in log order. Commands before the current tick are already
 * contained in the snapshot and skipped; at the current tick their IDs prevent a second effect.
 * Returns the results of the commands that were applied again; `onApplied` gets each of them with
 * its command (the replies of a worker restart, TS §8.5).
 */
export function replayCommands(
  engine: GameEngine,
  commands: readonly GameCommand[],
  targetTick: Tick,
  onApplied?: (command: GameCommand, result: CommandResult) => void,
): CommandResult[] {
  const results: CommandResult[] = [];
  for (const command of commands) {
    if (command.tick < engine.tick) {
      continue;
    }
    engine.runUntil(command.tick);
    const result = engine.applyCommand(command);
    results.push(result);
    onApplied?.(command, result);
  }
  engine.runUntil(targetTick);
  return results;
}
