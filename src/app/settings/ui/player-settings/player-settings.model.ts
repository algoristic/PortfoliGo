import { SpeedId } from '@app/clock/domain/models/speed.model';
import { BackgroundMode, BackgroundPauseAfter } from '@app/engine/domain/models/game-state.model';

export interface BackgroundModeOption {
  id: BackgroundMode;
  label: string;
  hint: string;
  checked: boolean;
}

export interface BackgroundSpeedOption {
  id: SpeedId;
  label: string;
  selected: boolean;
}

export interface BackgroundPauseAfterOption {
  /** Value of the `<option>`: the minutes, or `off` for `null`. */
  value: string;
  pauseAfter: BackgroundPauseAfter;
  label: string;
  selected: boolean;
}
