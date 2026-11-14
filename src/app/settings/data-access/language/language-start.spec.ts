import { clearTranslations, loadTranslations } from '@angular/localize';

import { formatCents } from '@app/shared/util/format';
import { formatLanguage, setFormatLanguage } from '@app/shared/util/locale';

import { LanguageStartPorts, startLanguage, storedLanguage } from './language-start';

const TRANSLATIONS = { 'test-languageStart-title': 'Settings' };

function entry(value: unknown): string {
  return JSON.stringify(value);
}

function ports(
  stored: string | null,
  fetch: LanguageStartPorts['fetch'] = vi.fn(async () => ({
    ok: true,
    json: async () => ({ locale: 'en', translations: TRANSLATIONS }),
  })),
): LanguageStartPorts & { root: { lang: string } } {
  return {
    storage: () => ({ getItem: () => stored }),
    fetch,
    loadTranslations,
    root: { lang: '' },
  };
}

function title(): string {
  return $localize`:@@test-languageStart-title:Einstellungen`;
}

describe('language-start', () => {
  afterEach(() => {
    clearTranslations();
    setFormatLanguage('de');
  });

  describe('storedLanguage', () => {
    // TS §9.3: version 1 of `pgo.settings`, anything else is German (E-36)
    it.each<[string, string | null, string]>([
      ['English of version 1', entry({ v: 1, data: { locale: { language: 'en' } } }), 'en'],
      ['German of version 1', entry({ v: 1, data: { locale: { language: 'de' } } }), 'de'],
      ['no entry', null, 'de'],
      ['another version', entry({ v: 2, data: { locale: { language: 'en' } } }), 'de'],
      ['an unknown language', entry({ v: 1, data: { locale: { language: 'fr' } } }), 'de'],
      ['broken JSON', '{"v":1,"data":', 'de'],
    ])('reads %s as %s', (_label, stored, language) => {
      expect(storedLanguage(() => ({ getItem: () => stored }))).toBe(language);
    });

    it('reads German when the browser blocks localStorage', () => {
      const blocked = (): Storage => {
        throw new DOMException('denied', 'SecurityError');
      };
      expect(storedLanguage(blocked)).toBe('de');
    });
  });

  describe('startLanguage', () => {
    it('starts German without loading translations', async () => {
      const start = ports(null);

      expect(await startLanguage(start)).toBe('de');
      expect(start.fetch).not.toHaveBeenCalled();
      expect(start.root.lang).toBe('de');
      expect(title()).toBe('Einstellungen');
    });

    it('loads the English translations and switches the formats', async () => {
      const start = ports(entry({ v: 1, data: { locale: { language: 'en' } } }));

      expect(await startLanguage(start)).toBe('en');
      expect(start.fetch).toHaveBeenCalledWith('assets/i18n/messages.en.json');
      expect(start.root.lang).toBe('en');
      expect(formatLanguage()).toBe('en');
      expect(title()).toBe('Settings');
      // TS §11.9: English amounts
      expect(formatCents(123456)).toBe('€1,234.56');
    });

    it.each<[string, LanguageStartPorts['fetch']]>([
      ['the request fails', async () => Promise.reject(new TypeError('offline'))],
      ['the file is missing', async () => ({ ok: false, json: async () => ({}) })],
      [
        'the file is no JSON',
        async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError('x')) }),
      ],
      [
        'the file has no translations',
        async () => ({ ok: true, json: async () => ({ locale: 'en' }) }),
      ],
      [
        'a translation is no text',
        async () => ({ ok: true, json: async () => ({ translations: { a: 1 } }) }),
      ],
    ])('starts German when %s', async (_label, fetch) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const start = ports(entry({ v: 1, data: { locale: { language: 'en' } } }), fetch);

      expect(await startLanguage(start)).toBe('de');
      expect(start.root.lang).toBe('de');
      expect(formatLanguage()).toBe('de');
      expect(title()).toBe('Einstellungen');
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });
});
