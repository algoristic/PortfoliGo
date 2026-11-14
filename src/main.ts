/// <reference types="@angular/localize" />

import { loadTranslations } from '@angular/localize';

import { startLanguage } from './app/settings/data-access/language/language-start';

// The language comes first (TS §11.9, E-36): `$localize` in module constants runs when a module is
// imported, so the app is imported only after the translations are loaded.
startLanguage({
  storage: () => window.localStorage,
  fetch: (url) => window.fetch(url, { cache: 'no-cache' }),
  loadTranslations,
  root: document.documentElement,
}).then(() => import('./bootstrap'));
