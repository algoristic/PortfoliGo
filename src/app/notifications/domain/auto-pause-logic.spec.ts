import fc from 'fast-check';

import { BACKGROUND_MODES, BackgroundMode } from '@app/engine/domain/models/game-state.model';

import {
  autoPauseApplies,
  autoPauseEnabled,
  autoPauseSettings,
  AutoPauseSettings,
  isAutoPauseCode,
  RUN_MODES,
  RunMode,
  shouldAutoPause,
  withAutoPause,
} from './auto-pause-logic';
import { AUTO_PAUSE_CODES, AutoPauseCode, NOTIFICATION_CODES } from './models/notification.model';

const arbCode = fc.constantFrom(...AUTO_PAUSE_CODES);
const arbSettings: fc.Arbitrary<AutoPauseSettings> = fc.dictionary(arbCode, fc.boolean());

describe('auto-pause-logic', () => {
  describe('autoPauseEnabled', () => {
    // TS §12: defaults of the table, column "Auto-Pause (Standard)"
    it.each<[AutoPauseCode, boolean]>([
      ['account-uncovered', false],
      ['overdraft-limit-exceeded', true],
      ['order-executed', false],
      ['order-rejected', false],
      ['interest-credited', false],
      ['month-closed', false],
      ['year-closed', false],
      ['storage-quota-exceeded', false],
    ])('defaults %s to %s', (code, expected) => {
      expect(autoPauseEnabled({}, code)).toBe(expected);
    });

    it('follows the player setting over the default', () => {
      expect(
        autoPauseEnabled({ 'overdraft-limit-exceeded': false }, 'overdraft-limit-exceeded'),
      ).toBe(false);
      expect(autoPauseEnabled({ 'account-uncovered': true }, 'account-uncovered')).toBe(true);
    });
  });

  describe('isAutoPauseCode', () => {
    it('accepts every code of TS §12 except the UI code backup-reminder', () => {
      expect(NOTIFICATION_CODES.filter((code) => !isAutoPauseCode(code))).toEqual([
        'backup-reminder',
      ]);
      expect(isAutoPauseCode('unknown')).toBe(false);
    });
  });

  describe('withAutoPause', () => {
    it('keeps only settings that differ from the default', () => {
      const off = withAutoPause({}, 'overdraft-limit-exceeded', false);
      expect(off).toEqual({ 'overdraft-limit-exceeded': false });
      expect(withAutoPause(off, 'overdraft-limit-exceeded', true)).toEqual({});
      expect(withAutoPause({}, 'account-uncovered', false)).toEqual({});
    });

    it('sets exactly the switched code and leaves the others', () => {
      fc.assert(
        fc.property(arbSettings, arbCode, fc.boolean(), (settings, code, enabled) => {
          const next = withAutoPause(settings, code, enabled);
          expect(autoPauseEnabled(next, code)).toBe(enabled);
          for (const other of AUTO_PAUSE_CODES.filter((candidate) => candidate !== code)) {
            expect(autoPauseEnabled(next, other)).toBe(autoPauseEnabled(settings, other));
          }
        }),
      );
    });
  });

  describe('autoPauseSettings', () => {
    it('lists every switchable code with its effective setting', () => {
      const settings = autoPauseSettings({ 'account-uncovered': true });
      expect(Object.keys(settings)).toEqual([...AUTO_PAUSE_CODES]);
      expect(settings['account-uncovered']).toBe(true);
      expect(settings['overdraft-limit-exceeded']).toBe(true);
      expect(settings['month-closed']).toBe(false);
    });
  });

  describe('shouldAutoPause', () => {
    // TS §12, table "Auto-Pause"; TS §3.6: hidden only in keep-speed and custom-speed (E-35)
    it.each<[AutoPauseCode, AutoPauseSettings, RunMode, boolean, BackgroundMode, boolean]>([
      ['overdraft-limit-exceeded', {}, 'live', true, 'realtime', true],
      ['overdraft-limit-exceeded', {}, 'live', false, 'realtime', false],
      ['overdraft-limit-exceeded', {}, 'live', false, 'pause', false],
      ['overdraft-limit-exceeded', {}, 'live', false, 'keep-speed', true],
      ['overdraft-limit-exceeded', {}, 'live', false, 'custom-speed', true],
      ['overdraft-limit-exceeded', {}, 'catch-up', true, 'realtime', false],
      ['overdraft-limit-exceeded', {}, 'catch-up', false, 'realtime', false],
      ['overdraft-limit-exceeded', {}, 'catch-up', false, 'keep-speed', false],
      ['overdraft-limit-exceeded', {}, 'catch-up', true, 'custom-speed', false],
      ['overdraft-limit-exceeded', {}, 'jump', true, 'realtime', true],
      ['overdraft-limit-exceeded', {}, 'jump', false, 'realtime', false],
      ['overdraft-limit-exceeded', {}, 'jump', false, 'pause', false],
      ['overdraft-limit-exceeded', {}, 'jump', false, 'keep-speed', true],
      ['overdraft-limit-exceeded', {}, 'jump', false, 'custom-speed', true],
      [
        'overdraft-limit-exceeded',
        { 'overdraft-limit-exceeded': false },
        'live',
        true,
        'realtime',
        false,
      ],
      [
        'overdraft-limit-exceeded',
        { 'overdraft-limit-exceeded': false },
        'live',
        false,
        'keep-speed',
        false,
      ],
      ['account-uncovered', {}, 'live', true, 'realtime', false],
      ['account-uncovered', { 'account-uncovered': true }, 'live', true, 'realtime', true],
      ['month-closed', { 'month-closed': true }, 'catch-up', false, 'keep-speed', false],
    ])(
      '%s with %j, %s, visible %s, %s → %s',
      (code, settings, mode, visible, backgroundMode, expected) => {
        expect(shouldAutoPause(code, settings, mode, visible, backgroundMode)).toBe(expected);
      },
    );

    it('never pauses while catching up, nor hidden in realtime or pause', () => {
      fc.assert(
        fc.property(
          arbCode,
          arbSettings,
          fc.constantFrom(...RUN_MODES),
          fc.boolean(),
          fc.constantFrom(...BACKGROUND_MODES),
          (code, settings, mode, visible, backgroundMode) => {
            const pause = shouldAutoPause(code, settings, mode, visible, backgroundMode);
            if (
              mode === 'catch-up' ||
              (!visible && ['realtime', 'pause'].includes(backgroundMode))
            ) {
              expect(pause).toBe(false);
            }
            if (pause) {
              expect(autoPauseEnabled(settings, code)).toBe(true);
              expect(autoPauseApplies(mode, visible, backgroundMode)).toBe(true);
            }
          },
        ),
      );
    });
  });
});
