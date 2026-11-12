import fc from 'fast-check';

import { clockCommand, clockShortcut, isShortcutBlocked } from './clock-control-logic';
import {
  ClockControlState,
  ClockIntent,
  FocusedElement,
  ShortcutKey,
} from './models/clock-control.model';
import { SpeedId, SPEEDS } from './models/speed.model';

function key(value: string, modifiers: Partial<ShortcutKey> = {}): ShortcutKey {
  return { key: value, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...modifiers };
}

function element(tagName: string, attributes: Partial<FocusedElement> = {}): FocusedElement {
  return { tagName, role: null, contentEditable: null, isContentEditable: false, ...attributes };
}

const BODY = element('BODY');

describe('clock-control-logic', () => {
  describe('clockShortcut', () => {
    // TS §11.10, keys of the clock shortcuts (PS US-ZT-02).
    it.each([
      [' ', 'toggle-pause'],
      ['Spacebar', 'toggle-pause'],
      ['+', 'faster'],
      ['=', 'faster'],
      ['Add', 'faster'],
      ['-', 'slower'],
      ['−', 'slower'],
      ['Subtract', 'slower'],
      ['Enter', null],
      ['p', null],
      ['ArrowUp', null],
      ['*', null],
    ] as const)('maps the key %j with focus on body to %s', (value, expected) => {
      expect(clockShortcut(key(value), BODY)).toBe(expected);
    });

    // TS §11.10: the browser's shortcuts (zoom with Ctrl and +) stay the browser's.
    it.each([
      [key('+', { ctrlKey: true })],
      [key('-', { metaKey: true })],
      [key(' ', { altKey: true })],
    ])('ignores a press with a modifier (%o)', (event) => {
      expect(clockShortcut(event, BODY)).toBeNull();
    });

    it('allows Shift, which some layouts need for +', () => {
      expect(clockShortcut({ ...key('+'), shiftKey: true } as ShortcutKey, BODY)).toBe('faster');
    });

    it('ignores a held space but repeats + and −', () => {
      expect(clockShortcut(key(' ', { repeat: true }), BODY)).toBeNull();
      expect(clockShortcut(key('+', { repeat: true }), BODY)).toBe('faster');
      expect(clockShortcut(key('-', { repeat: true }), BODY)).toBe('slower');
    });

    it('applies without a focused element and on a plain container', () => {
      expect(clockShortcut(key(' '), null)).toBe('toggle-pause');
      expect(clockShortcut(key(' '), element('MAIN'))).toBe('toggle-pause');
    });

    it('never applies while the focused element blocks the keys', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(' ', '+', '-', '=', 'Add', 'Subtract'),
          fc.constantFrom(
            element('INPUT'),
            element('button'),
            element('DIV', { role: 'menuitem' }),
            element('DIV', { contentEditable: 'true' }),
          ),
          (value, focused) => {
            expect(clockShortcut(key(value), focused)).toBeNull();
          },
        ),
      );
    });
  });

  describe('isShortcutBlocked', () => {
    // TS §11.10: shortcuts don't apply while a form field or control has the focus.
    it.each([
      [element('BODY'), false],
      [element('HTML'), false],
      [element('MAIN'), false],
      [element('DIV'), false],
      [element('SECTION', { role: 'region' }), false],
      [element('DIV', { role: 'status' }), false],
      [element('INPUT'), true],
      [element('input'), true],
      [element('TEXTAREA'), true],
      [element('SELECT'), true],
      [element('BUTTON'), true],
      [element('A'), true],
      [element('SUMMARY'), true],
      [element('IFRAME'), true],
      [element('VIDEO'), true],
      [element('DIV', { role: 'button' }), true],
      [element('DIV', { role: 'menuitem' }), true],
      [element('DIV', { role: 'tab' }), true],
      [element('LI', { role: 'option' }), true],
      [element('DIV', { role: 'slider' }), true],
      [element('DIV', { role: 'dialog' }), true],
      [element('DIV', { role: 'Switch' }), true],
      [element('DIV', { role: 'presentation menuitemradio' }), true],
      [element('DIV', { contentEditable: '' }), true],
      [element('DIV', { contentEditable: 'true' }), true],
      [element('DIV', { contentEditable: 'PLAINTEXT-ONLY' }), true],
      [element('DIV', { contentEditable: 'false' }), false],
      [element('SPAN', { isContentEditable: true }), true],
    ])('returns for %o: %s', (focused, expected) => {
      expect(isShortcutBlocked(focused)).toBe(expected);
    });

    it('returns false without a focused element', () => {
      expect(isShortcutBlocked(null)).toBe(false);
    });
  });

  describe('clockCommand', () => {
    const running: ClockControlState = { speed: '1h', paused: false };
    const paused: ClockControlState = { speed: '1h', paused: true };

    // PS US-ZT-02: pause and resume, speeds in the order of TS §3.4.
    it.each<[ClockIntent, ClockControlState, unknown]>([
      ['toggle-pause', running, { type: 'pause' }],
      ['toggle-pause', paused, { type: 'resume' }],
      ['pause', running, { type: 'pause' }],
      ['pause', paused, null],
      ['resume', paused, { type: 'resume' }],
      ['resume', running, null],
      ['faster', running, { type: 'setSpeed', speed: '2h' }],
      ['slower', running, { type: 'setSpeed', speed: '10min' }],
      ['faster', paused, { type: 'setSpeed', speed: '2h' }],
      ['faster', { speed: '1w', paused: false }, null],
      ['slower', { speed: 'realtime', paused: false }, null],
      ['slower', { speed: '1min', paused: false }, { type: 'setSpeed', speed: 'realtime' }],
      [{ speed: '1d' }, running, { type: 'setSpeed', speed: '1d' }],
      [{ speed: '1h' }, running, null],
    ])('turns %o at %o into %o', (intent, clock, expected) => {
      expect(clockCommand(intent, clock)).toEqual(expected);
    });

    it('does nothing before the first clock event', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<ClockIntent>('toggle-pause', 'pause', 'resume', 'faster', 'slower'),
          (intent) => {
            expect(clockCommand(intent, null)).toBeNull();
          },
        ),
      );
    });

    it('steps through every speed with faster and back with slower', () => {
      const ids: SpeedId[] = SPEEDS.map((speed) => speed.id);
      let speed: SpeedId = 'realtime';
      const visited: SpeedId[] = [speed];
      for (let command = clockCommand('faster', { speed, paused: false }); command !== null;) {
        expect(command.type).toBe('setSpeed');
        speed = (command as { speed: SpeedId }).speed;
        visited.push(speed);
        command = clockCommand('faster', { speed, paused: false });
      }
      expect(visited).toEqual(ids);
      for (let command = clockCommand('slower', { speed, paused: false }); command !== null;) {
        speed = (command as { speed: SpeedId }).speed;
        visited.pop();
        expect(speed).toBe(visited.at(-1));
        command = clockCommand('slower', { speed, paused: false });
      }
      expect(speed).toBe('realtime');
    });
  });
});
