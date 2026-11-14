import fc from 'fast-check';

import { NOTIFICATION_CODES } from '@app/notifications/domain/models/notification.model';
import { withNotificationChannel } from '@app/notifications/domain/notification-channel-logic';
import { LANGUAGES } from '@app/shared/util/locale';

import { CHANGE_COLOR_SETTINGS, COLOR_SCHEME_SETTINGS, Settings } from './models/settings.model';
import { languageOfSettings, parseSettings } from './settings-logic';

const arbChanges = fc.array(
  fc.tuple(
    fc.constantFrom('toast' as const, 'browser' as const),
    fc.constantFrom(...NOTIFICATION_CODES),
    fc.boolean(),
  ),
);

const arbSettings: fc.Arbitrary<Settings> = fc
  .record({
    colorScheme: fc.constantFrom(...COLOR_SCHEME_SETTINGS),
    changeColors: fc.constantFrom(...CHANGE_COLOR_SETTINGS),
    language: fc.constantFrom(...LANGUAGES),
    priceHighlight: fc.boolean(),
    shortcuts: fc.boolean(),
    changes: arbChanges,
  })
  .map(({ colorScheme, changeColors, language, priceHighlight, shortcuts, changes }) => ({
    appearance: { colorScheme, changeColors },
    locale: { language },
    motion: { priceHighlight },
    shortcuts: { enabled: shortcuts },
    notifications: changes.reduce(
      (result, [channel, code, enabled]) => withNotificationChannel(result, channel, code, enabled),
      { toast: {}, browser: {} },
    ),
  }));

// TS §9.3: PS US-UI-01, E-06 dark; US-UI-02 green and red; US-UI-11, E-36 German; US-MK-05
// highlight on; TS §11.10 shortcuts on; TS §12 toasts and browser notifications as in the table.
const DEFAULTS: Settings = {
  appearance: { colorScheme: 'dark', changeColors: 'green-red' },
  locale: { language: 'de' },
  motion: { priceHighlight: true },
  shortcuts: { enabled: true },
  notifications: { toast: {}, browser: {} },
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
    [
      'sections that are no objects',
      { appearance: 'light', locale: 'en', motion: [], shortcuts: false, notifications: 'off' },
    ],
    [
      'unknown values',
      {
        appearance: { colorScheme: 'blue', changeColors: 'red-green' },
        locale: { language: 'fr' },
        motion: { priceHighlight: 'no' },
        shortcuts: { enabled: 'no' },
        notifications: { toast: { 'order-executed': 0 }, browser: ['order-executed'] },
      },
    ],
  ])('returns the defaults for %s', (_label, data) => {
    expect(parseSettings(data)).toEqual(DEFAULTS);
  });

  it('gives an entry of AP 2.6 the defaults of the later sections', () => {
    // TS §9.3: version 1 as AP 2.6 wrote it, without colours, motion and notifications.
    expect(
      parseSettings({ appearance: { colorScheme: 'light' }, shortcuts: { enabled: false } }),
    ).toEqual({
      ...DEFAULTS,
      appearance: { colorScheme: 'light', changeColors: 'green-red' },
      shortcuts: { enabled: false },
    });
  });

  it('replaces only the invalid values and keeps the valid ones', () => {
    expect(
      parseSettings({
        appearance: { colorScheme: 'Dunkel', changeColors: 'blue-orange' },
        locale: { language: 'en' },
        motion: { priceHighlight: false },
        shortcuts: { enabled: 1 },
        notifications: {
          toast: { 'order-executed': false, 'dividend-received': 'yes' },
          browser: { 'backup-reminder': true, 'order-expired': true },
        },
      }),
    ).toEqual({
      appearance: { colorScheme: 'dark', changeColors: 'blue-orange' },
      locale: { language: 'en' },
      motion: { priceHighlight: false },
      shortcuts: { enabled: true },
      notifications: {
        toast: { 'order-executed': false },
        browser: { 'order-expired': true },
      },
    });
  });

  it('drops toast and browser settings equal to the defaults of TS §12', () => {
    expect(
      parseSettings({
        notifications: {
          toast: { 'order-executed': true, 'dividend-received': false },
          browser: { 'account-uncovered': true, 'order-executed': false },
        },
      }).notifications,
    ).toEqual({ toast: {}, browser: {} });
  });

  it('returns valid settings for any JSON value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const settings = parseSettings(data);
        expect(COLOR_SCHEME_SETTINGS).toContain(settings.appearance.colorScheme);
        expect(CHANGE_COLOR_SETTINGS).toContain(settings.appearance.changeColors);
        expect(LANGUAGES).toContain(settings.locale.language);
        expect(typeof settings.motion.priceHighlight).toBe('boolean');
        expect(typeof settings.shortcuts.enabled).toBe('boolean');
        for (const channel of ['toast', 'browser'] as const) {
          for (const value of Object.values(settings.notifications[channel])) {
            expect(typeof value).toBe('boolean');
          }
        }
      }),
    );
  });
});

describe('languageOfSettings', () => {
  // TS §9.3: `locale.language` is `de` or `en`, anything else is German (E-36)
  it.each([
    [{ locale: { language: 'en' } }, 'en'],
    [{ locale: { language: 'de' } }, 'de'],
    [{ locale: { language: 'EN' } }, 'de'],
    [{ locale: { language: 'en-GB' } }, 'de'],
    [{ locale: 'en' }, 'de'],
    [{ appearance: { colorScheme: 'light' } }, 'de'],
    [null, 'de'],
    [undefined, 'de'],
  ])('reads %j as %s', (data, language) => {
    expect(languageOfSettings(data)).toBe(language);
  });
});
