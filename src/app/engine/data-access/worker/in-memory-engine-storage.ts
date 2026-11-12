import { GameCommand } from '@app/engine/domain/models/engine-command.model';

import { EngineStorage, StoredClock } from './engine-host.model';

export interface StoredCommand {
  playerId: string;
  command: GameCommand;
  clock: StoredClock;
}

/** Storage of AP 2.2: keeps the command log and the clock state in memory (lost on reload). */
export class InMemoryEngineStorage implements EngineStorage {
  readonly commands: StoredCommand[] = [];
  readonly clocks = new Map<string, StoredClock>();

  async appendCommand(playerId: string, command: GameCommand, clock: StoredClock): Promise<void> {
    this.commands.push({ playerId, command: structuredClone(command), clock: { ...clock } });
    this.clocks.set(playerId, { ...clock });
  }

  async saveClock(playerId: string, clock: StoredClock): Promise<void> {
    this.clocks.set(playerId, { ...clock });
  }
}
