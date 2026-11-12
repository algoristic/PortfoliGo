import { Tick } from '@app/clock/domain/models/time.model';

import { BackgroundMode } from './game-state.model';

/**
 * Game commands (TS §8.2) carry the tick after which they take effect: a command with tick T
 * acts after tick T and before T + 1 (TS §3.8, §8.5).
 */
interface CommandBase {
  id: string;
  tick: Tick;
}

export interface SetBackgroundModeCommand extends CommandBase {
  type: 'setBackgroundMode';
  mode: BackgroundMode;
}

export type GameCommand = SetBackgroundModeCommand;

export const COMMAND_ERRORS = ['tick-mismatch', 'invalid-command'] as const;
export type CommandError = (typeof COMMAND_ERRORS)[number];

export type CommandResult = { ok: true } | { ok: false; error: CommandError };
