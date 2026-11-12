import { SpeedId } from '@app/clock/domain/models/speed.model';

export interface SpeedOption {
  id: SpeedId;
  label: string;
}

/** What the clock menu offers besides the speeds. */
export const CLOCK_MENU_ACTIONS = ['jump'] as const;
export type ClockMenuAction = (typeof CLOCK_MENU_ACTIONS)[number];
