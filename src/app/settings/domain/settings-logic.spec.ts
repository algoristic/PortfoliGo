import fc from 'fast-check';

import { COLOR_SCHEME_SETTINGS, Settings } from './models/settings.model';
import { parseSettings } from './settings-logic';

const arbSettings: fc.Arbitrary<Settings> = fc.record({
  appearance: fc.record({ colorScheme: fc.constantFrom(...COLOR_SCHEME_SETTINGS) }),
  shortcuts: fc.record({ enabled: fc.boolean() }),
});

// PS US-UI-01, E-06: dark by default; TS §11.10: shortcuts on by default.
const DEFAULTS: Settings = {
  appearance: { colorScheme: 'dark' },
  shortcuts: { enabled: true },
};

describe('parseSettings', () => {
  it('keeps stored settings after a JSON round trip', () => {
    fc.assert(
      fc.property(arbSettings, (settings) => {
        expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
      }),
    );
  });

  it.each([
    ['nothing stored', undefined],
    ['null', null],
    ['a string', 'dark'],
    ['an array', [{ appearance: { colorScheme: 'light' } }]],
    ['an empty object', {}],
    ['sections that are no objects', { appearance: 'light', shortcuts: false }],
    ['unknown values', { appearance: { colorScheme: 'blue' }, shortcuts: { enabled: 'no' } }],
  ])('returns the defaults for %s', (_label, data) => {
    expect(parseSettings(data)).toEqual(DEFAULTS);
  });

  it('replaces only the invalid values and keeps the valid ones', () => {
    expect(
      parseSettings({ appearance: { colorScheme: 'light' }, shortcuts: { enabled: 1 } }),
    ).toEqual({
      appearance: { colorScheme: 'light' },
      shortcuts: { enabled: true },
    });
    expect(
      parseSettings({ appearance: { colorScheme: 'Dunkel' }, shortcuts: { enabled: false } }),
    ).toEqual({
      appearance: { colorScheme: 'dark' },
      shortcuts: { enabled: false },
    });
  });

  it('returns valid settings for any JSON value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const settings = parseSettings(data);
        expect(COLOR_SCHEME_SETTINGS).toContain(settings.appearance.colorScheme);
        expect(typeof settings.shortcuts.enabled).toBe('boolean');
      }),
    );
  });
});
