import {
  formatLanguage,
  formatLocale,
  isLanguage,
  numberSeparators,
  perLocale,
  setFormatLanguage,
} from './locale';

describe('locale', () => {
  afterEach(() => setFormatLanguage('de'));

  // TS §11.9, E-36: German `de-DE` by default, English `en-GB`
  it('starts German and switches the locale and separators with the language', () => {
    expect(formatLanguage()).toBe('de');
    expect(formatLocale()).toBe('de-DE');
    expect(numberSeparators()).toEqual({ group: '.', decimal: ',' });
    setFormatLanguage('en');
    expect(formatLanguage()).toBe('en');
    expect(formatLocale()).toBe('en-GB');
    expect(numberSeparators()).toEqual({ group: ',', decimal: '.' });
  });

  it.each([
    ['de', true],
    ['en', true],
    ['en-GB', false],
    ['DE', false],
    [null, false],
    [1, false],
  ])('knows whether %j is a language', (value, expected) => {
    expect(isLanguage(value)).toBe(expected);
  });

  describe('perLocale', () => {
    it('creates one value per locale and keeps it', () => {
      const create = vi.fn((locale: string) => ({ locale }));
      const value = perLocale(create);
      const german = value();
      expect(value()).toBe(german);
      setFormatLanguage('en');
      expect(value()).toEqual({ locale: 'en-GB' });
      setFormatLanguage('de');
      expect(value()).toBe(german);
      expect(create.mock.calls).toEqual([['de-DE'], ['en-GB']]);
    });
  });
});
