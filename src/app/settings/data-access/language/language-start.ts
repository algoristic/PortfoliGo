import { isVersionedEntry } from '@app/persistence/data-access/local-storage/local-storage-service.utils';
import { languageOfSettings } from '@app/settings/domain/settings-logic';
import { DEFAULT_LANGUAGE, Language, setFormatLanguage } from '@app/shared/util/locale';

import { SETTINGS_VERSION } from '../service/settings-service.model';

/**
 * Translations per language besides the source language German, relative to `<base href>`
 * (TS §11.9). `tools/i18n.mjs` generates the file from `src/locale/messages.en.xlf`; the service
 * worker caches it with the other assets (TS §13).
 */
export const TRANSLATION_FILES: Readonly<Partial<Record<Language, string>>> = {
  en: 'assets/i18n/messages.en.json',
};

/** What the start of the app needs from the platform; `main.ts` passes the browser's. */
export interface LanguageStartPorts {
  /** `localStorage`; may throw when the browser blocks storage. */
  storage: () => Pick<Storage, 'getItem'> | null | undefined;
  fetch: (url: string) => Promise<Pick<Response, 'ok' | 'json'>>;
  /** `loadTranslations` of `@angular/localize`. */
  loadTranslations: (translations: Record<string, string>) => void;
  /** `<html>`, whose `lang` follows the language. */
  root: { lang: string };
}

/** The language of `pgo.settings` (TS §9.3); German when nothing valid is stored (E-36). */
export function storedLanguage(storage: LanguageStartPorts['storage']): Language {
  try {
    const raw = storage()?.getItem('pgo.settings');
    const entry: unknown = raw ? JSON.parse(raw) : undefined;
    return isVersionedEntry(entry) && entry.v === SETTINGS_VERSION
      ? languageOfSettings(entry.data)
      : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Prepares the language before the app is imported (TS §11.9, E-36): reads the setting, loads the
 * translations of a language other than German and sets the formats and `<html lang>`. If the
 * translations can't be loaded, the app starts in German instead of failing.
 */
export async function startLanguage(ports: LanguageStartPorts): Promise<Language> {
  const wanted = storedLanguage(ports.storage);
  const language = (await loadTranslationsOf(wanted, ports)) ? wanted : DEFAULT_LANGUAGE;
  setFormatLanguage(language);
  ports.root.lang = language;
  return language;
}

async function loadTranslationsOf(language: Language, ports: LanguageStartPorts): Promise<boolean> {
  const file = TRANSLATION_FILES[language];
  if (file === undefined) {
    return true;
  }
  try {
    const response = await ports.fetch(file);
    const translations = response.ok ? translationsOf(await response.json()) : null;
    if (translations === null) {
      console.warn(`The translations of "${language}" are missing; the app starts in German.`);
      return false;
    }
    ports.loadTranslations(translations);
    return true;
  } catch (error: unknown) {
    console.warn(
      `The translations of "${language}" failed to load; the app starts in German.`,
      error,
    );
    return false;
  }
}

/** The `translations` of a file in the JSON format of `@angular/localize`, or `null`. */
function translationsOf(file: unknown): Record<string, string> | null {
  const translations =
    typeof file === 'object' && file !== null && 'translations' in file
      ? file.translations
      : undefined;
  if (typeof translations !== 'object' || translations === null || Array.isArray(translations)) {
    return null;
  }
  const entries = Object.entries(translations);
  return entries.length > 0 && entries.every(([, text]) => typeof text === 'string')
    ? Object.fromEntries(entries)
    : null;
}
