import { Tick, TradingHours } from '@app/clock/domain/models/time.model';
import { JumpTarget, JumpTargetKind } from '@app/engine/domain/models/jump-target.model';

export interface JumpDialogData {
  /** Game time when the dialog opened; the targets are computed from it. */
  now: Tick;
  /** Trading hours of all exchanges, for the next opening. */
  sessions: TradingHours[];
}

/** The chosen target; `undefined` when the dialog was closed without jumping. */
export type JumpDialogResult = JumpTarget;

/** Values of the controls: the date and time inputs hold their native string values. */
export interface JumpFormModel {
  kind: JumpTargetKind;
  date: string;
  time: string;
}
