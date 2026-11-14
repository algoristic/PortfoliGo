import { isCommandPaletteShortcut, nextActiveIndex } from './command-palette-logic';
import { ShortcutKeyEvent } from './models/command.model';

const NONE: ShortcutKeyEvent = {
  key: 'k',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
};

describe('command-palette-logic', () => {
  describe('isCommandPaletteShortcut', () => {
    // TS §11.10: shortcut of the command palette
    it.each<[string, Partial<ShortcutKeyEvent>, boolean]>([
      ['Ctrl+K', { ctrlKey: true }, true],
      ['Cmd+K', { metaKey: true }, true],
      ['Ctrl+K with caps lock', { ctrlKey: true, key: 'K' }, true],
      ['K alone', {}, false],
      ['Ctrl+J', { ctrlKey: true, key: 'j' }, false],
      ['Ctrl+Shift+K', { ctrlKey: true, shiftKey: true, key: 'K' }, false],
      ['Ctrl+Alt+K (AltGr)', { ctrlKey: true, altKey: true }, false],
      ['held Ctrl+K', { ctrlKey: true, repeat: true }, false],
    ])('%s → %s', (_name, event, expected) => {
      expect(isCommandPaletteShortcut({ ...NONE, ...event })).toBe(expected);
    });
  });

  describe('nextActiveIndex', () => {
    it.each<[number, 'ArrowDown' | 'ArrowUp', number, number]>([
      [0, 'ArrowDown', 3, 1],
      [2, 'ArrowDown', 3, 0],
      [0, 'ArrowUp', 3, 2],
      [1, 'ArrowUp', 3, 0],
      [-1, 'ArrowDown', 3, 0],
      [0, 'ArrowDown', 1, 0],
      [0, 'ArrowDown', 0, -1],
      [0, 'ArrowUp', 0, -1],
    ])('moves from %d with %s in %d options to %d', (index, key, count, expected) => {
      expect(nextActiveIndex(index, key, count)).toBe(expected);
    });
  });
});
