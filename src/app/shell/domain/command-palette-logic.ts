import { ShortcutKeyEvent } from './models/command.model';

/**
 * `Strg`+`K` or `⌘`+`K` opens the command palette (PS US-UI-05, TS §11.10), also in a text field.
 * Alt is excluded because AltGr arrives as Ctrl+Alt on Windows; Shift and held keys don't count.
 */
export function isCommandPaletteShortcut(event: Readonly<ShortcutKeyEvent>): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    event.key.toLowerCase() === 'k'
  );
}

/** The active option after an arrow key in a list of `count` options; it wraps at both ends. */
export function nextActiveIndex(
  index: number,
  key: 'ArrowDown' | 'ArrowUp',
  count: number,
): number {
  if (count <= 0) {
    return -1;
  }
  const step = key === 'ArrowDown' ? 1 : -1;
  return (((index + step) % count) + count) % count;
}
