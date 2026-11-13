import fc from 'fast-check';

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
    // TS §12, table "Auto-Pause"
    it.each<[AutoPauseCode, AutoPauseSettings, RunMode, boolean, boolean]>([
      ['overdraft-limit-exceeded', {}, 'live', true, true],
      ['overdraft-limit-exceeded', {}, 'live', false, false],
      ['overdraft-limit-exceeded', {}, 'catch-up', true, false],
      ['overdraft-limit-exceeded', {}, 'catch-up', false, false],
      ['overdraft-limit-exceeded', {}, 'jump', true, true],
      ['overdraft-limit-exceeded', {}, 'jump', false, false],
      ['overdraft-limit-exceeded', { 'overdraft-limit-exceeded': false }, 'live', true, false],
      ['account-uncovered', {}, 'live', true, false],
      ['account-uncovered', { 'account-uncovered': true }, 'live', true, true],
      ['month-closed', { 'month-closed': true }, 'catch-up', false, false],
    ])('%s with %j, %s, visible %s → %s', (code, settings, mode, visible, expected) => {
      expect(shouldAutoPause(code, settings, mode, visible)).toBe(expected);
    });

    it('never pauses while catching up or hidden', () => {
      fc.assert(
        fc.property(
          arbCode,
          arbSettings,
          fc.constantFrom(...RUN_MODES),
          fc.boolean(),
          (code, settings, mode, visible) => {
            const pause = shouldAutoPause(code, settings, mode, visible);
            if (mode === 'catch-up' || !visible) {
              expect(pause).toBe(false);
            }
            if (pause) {
              expect(autoPauseEnabled(settings, code)).toBe(true);
              expect(autoPauseApplies(mode, visible)).toBe(true);
            }
          },
        ),
      );
    });
  });
});
