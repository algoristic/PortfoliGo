import { SpeedId } from './speed.model';

/** Clock shortcuts without a modifier (PS US-ZT-02, TS §11.10). */
export const CLOCK_SHORTCUTS = ['toggle-pause', 'faster', 'slower'] as const;
export type ClockShortcut = (typeof CLOCK_SHORTCUTS)[number];

/** The parts of a `keydown` event the shortcuts look at. */
export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

/** The parts of the focused element (`document.activeElement`) the shortcuts look at. */
export interface FocusedElement {
  tagName: string;
  role: string | null;
  /** Value of the `contenteditable` attribute, `null` without it. */
  contentEditable: string | null;
  /** `HTMLElement.isContentEditable`, also `true` inside an editable ancestor. */
  isContentEditable: boolean;
}

/** What the player wants the clock to do: a click in the header or a shortcut. */
export type ClockIntent = ClockShortcut | 'pause' | 'resume' | { speed: SpeedId };

/** Engine command that carries out an intent. */
export type ClockCommand =
  { type: 'pause' } | { type: 'resume' } | { type: 'setSpeed'; speed: SpeedId };

/** Speed and pause as the last `clock` event reported them. */
export interface ClockControlState {
  speed: SpeedId;
  paused: boolean;
}
