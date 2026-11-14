// Language of the texts and the formats (TS §11.9, E-36). `main.ts` sets it once before the app
// starts; a change of the language setting reloads the app. Currency (EUR) and time zone (UTC) stay
// the same in every language.

/** Languages of the app; German is the source language and the default (E-36). */
export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'de';

/** Locale of the number and date formats per language: English uses British formats (E-36). */
export const FORMAT_LOCALES = {
  de: 'de-DE',
  en: 'en-GB',
} as const satisfies Record<Language, string>;

/** Separators of numbers as the formats write them and as inputs read them. */
export interface NumberSeparators {
  group: string;
  decimal: string;
}

const SEPARATORS: Record<Language, NumberSeparators> = {
  de: { group: '.', decimal: ',' },
  en: { group: ',', decimal: '.' },
};

let language: Language = DEFAULT_LANGUAGE;

export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

/** Sets the language of all formats; called by `main.ts` before the app starts and by tests. */
export function setFormatLanguage(next: Language): void {
  language = next;
}

export function formatLanguage(): Language {
  return language;
}

/** BCP 47 locale of the current language, e.g. `de-DE`. */
export function formatLocale(): string {
  return FORMAT_LOCALES[language];
}

/** Separators of the current language: `.` and `,` in German, `,` and `.` in English. */
export function numberSeparators(): NumberSeparators {
  return SEPARATORS[language];
}

/**
 * A value per locale that is created on first use, e.g. an `Intl.DateTimeFormat`: creating them is
 * expensive, and module constants would keep the locale of the moment the module was loaded.
 */
export function perLocale<T>(create: (locale: string) => T): () => T {
  const values = new Map<string, T>();
  return () => {
    const locale = formatLocale();
    let value = values.get(locale);
    if (value === undefined) {
      value = create(locale);
      values.set(locale, value);
    }
    return value;
  };
}
