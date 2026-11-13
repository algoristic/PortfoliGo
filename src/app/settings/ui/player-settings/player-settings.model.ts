import { BackgroundMode } from '@app/engine/domain/models/game-state.model';

export interface BackgroundModeOption {
  id: BackgroundMode;
  label: string;
  hint: string;
  checked: boolean;
}
