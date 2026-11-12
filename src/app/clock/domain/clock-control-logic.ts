import { fasterSpeed, slowerSpeed } from './clock-logic';
import {
  ClockCommand,
  ClockControlState,
  ClockIntent,
  ClockShortcut,
  FocusedElement,
  ShortcutKey,
} from './models/clock-control.model';

// Rules of the clock controls (PS US-ZT-02, TS §11.10).

const SHORTCUT_KEYS: Readonly<Record<string, ClockShortcut>> = {
  ' ': 'toggle-pause',
  Spacebar: 'toggle-pause',
  '+': 'faster',
  '=': 'faster',
  Add: 'faster',
  '-': 'slower',
  '−': 'slower',
  Subtract: 'slower',
};

/** Elements that use the keys themselves: form fields, controls and embedded content. */
const INTERACTIVE_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
  'A',
  'SUMMARY',
  'IFRAME',
  'AUDIO',
  'VIDEO',
  'OBJECT',
  'EMBED',
]);

/** ARIA roles of widgets and of dialogs, whose keys belong to them. */
const INTERACTIVE_ROLES = new Set([
  'alertdialog',
  'application',
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'grid',
  'gridcell',
  'link',
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'radiogroup',
  'scrollbar',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'textbox',
  'tree',
  'treegrid',
  'treeitem',
]);

const EDITABLE_VALUES = new Set(['', 'true', 'plaintext-only']);

/**
 * `true` while the focused element uses the keys itself (TS §11.10): form fields, controls, editable
 * content and widgets by their role. Without focus (`null`), on `body` or on a plain container such
 * as `main` the shortcuts apply.
 */
export function isShortcutBlocked(focused: FocusedElement | null): boolean {
  if (focused === null) {
    return false;
  }
  if (INTERACTIVE_TAGS.has(focused.tagName.toUpperCase())) {
    return true;
  }
  if (
    focused.isContentEditable ||
    (focused.contentEditable !== null && EDITABLE_VALUES.has(focused.contentEditable.toLowerCase()))
  ) {
    return true;
  }
  const roles = (focused.role ?? '').toLowerCase().split(/\s+/);
  return roles.some((role) => INTERACTIVE_ROLES.has(role));
}

/**
 * Shortcut of a key press, or `null` (PS US-ZT-02, TS §11.10): space toggles the pause, `+` and
 * `−` change the speed (also `=`, `-` and the numeric keypad). Presses with Ctrl, Alt or Meta are
 * the browser's (zoom), a held space doesn't toggle again, and nothing applies while the focused
 * element uses the keys itself.
 */
export function clockShortcut(
  event: ShortcutKey,
  focused: FocusedElement | null,
): ClockShortcut | null {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  const shortcut = SHORTCUT_KEYS[event.key];
  if (shortcut === undefined || (shortcut === 'toggle-pause' && event.repeat)) {
    return null;
  }
  return isShortcutBlocked(focused) ? null : shortcut;
}

/**
 * Engine command for an intent, or `null` if there is nothing to do: no clock yet, pause while
 * paused, resume while running, a speed that is already chosen, or faster or slower at the end of
 * `SPEEDS`.
 */
export function clockCommand(
  intent: ClockIntent,
  clock: ClockControlState | null,
): ClockCommand | null {
  if (clock === null) {
    return null;
  }
  const speedCommand = (speed: ClockControlState['speed']): ClockCommand | null =>
    speed === clock.speed ? null : { type: 'setSpeed', speed };
  switch (intent) {
    case 'toggle-pause':
      return { type: clock.paused ? 'resume' : 'pause' };
    case 'pause':
      return clock.paused ? null : { type: 'pause' };
    case 'resume':
      return clock.paused ? { type: 'resume' } : null;
    case 'faster':
      return speedCommand(fasterSpeed(clock.speed));
    case 'slower':
      return speedCommand(slowerSpeed(clock.speed));
    default:
      return speedCommand(intent.speed);
  }
}
