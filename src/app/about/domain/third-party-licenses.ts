import { ThirdPartyLicense } from './models/third-party-license.model';

/** Name and link of the creator of lightweight-charts that its license requires (TS §11.7, E-04). */
export const TRADINGVIEW_ATTRIBUTION = {
  notice: 'TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.',
  url: 'https://www.tradingview.com/',
} as const;

/**
 * Every library and font in the build (runtime dependencies of `package.json`, their shipped
 * transitive dependencies and the Tailwind CSS base styles), with the license from its package.
 * `third-party-licenses.spec.ts` checks the list against `package.json` and `node_modules`.
 */
export const THIRD_PARTY_LICENSES: readonly ThirdPartyLicense[] = [
  {
    id: 'angular',
    name: 'Angular',
    packages: [
      '@angular/common',
      '@angular/compiler',
      '@angular/core',
      '@angular/forms',
      '@angular/localize',
      '@angular/platform-browser',
      '@angular/router',
      '@angular/service-worker',
    ],
    license: 'MIT',
    copyright: 'Copyright (c) 2010-2026 Google LLC',
    url: 'https://github.com/angular/angular',
  },
  {
    id: 'angular-components',
    name: 'Angular CDK, Angular Aria',
    packages: ['@angular/cdk', '@angular/aria'],
    license: 'MIT',
    copyright: 'Copyright (c) 2026 Google LLC',
    url: 'https://github.com/angular/components',
  },
  {
    id: 'ngrx',
    name: 'NgRx',
    packages: [
      '@ngrx/effects',
      '@ngrx/entity',
      '@ngrx/operators',
      '@ngrx/router-store',
      '@ngrx/store',
      '@ngrx/store-devtools',
    ],
    license: 'MIT',
    copyright: 'Copyright (c) 2017-2023 Brandon Roberts, Mike Ryan, Victor Savkin, Rob Wormald',
    url: 'https://github.com/ngrx/platform',
  },
  {
    id: 'rxjs',
    name: 'RxJS',
    packages: ['rxjs'],
    license: 'Apache-2.0',
    copyright:
      'Copyright (c) 2015-2018 Google, Inc., Netflix, Inc., Microsoft Corp. and contributors',
    url: 'https://github.com/reactivex/rxjs',
  },
  {
    id: 'idb',
    name: 'IndexedDB with usability (idb)',
    packages: ['idb'],
    license: 'ISC',
    copyright: 'Copyright (c) 2016, Jake Archibald',
    url: 'https://github.com/jakearchibald/idb',
  },
  {
    id: 'lightweight-charts',
    name: 'TradingView Lightweight Charts™',
    packages: ['lightweight-charts'],
    license: 'Apache-2.0',
    copyright: 'Copyright (c) 2025 TradingView, Inc.',
    url: 'https://www.tradingview.com/lightweight-charts/',
  },
  {
    id: 'fancy-canvas',
    name: 'fancy-canvas',
    packages: ['fancy-canvas'],
    license: 'MIT',
    copyright: 'TradingView, Inc.',
    url: 'https://github.com/tradingview/fancy-canvas',
  },
  {
    id: 'inter',
    name: 'Inter (Schrift)',
    packages: ['@fontsource-variable/inter'],
    license: 'OFL-1.1',
    copyright: 'Copyright (c) 2016 The Inter Project Authors',
    url: 'https://github.com/rsms/inter',
  },
  {
    id: 'bootstrap-icons',
    name: 'Bootstrap Icons',
    packages: ['bootstrap-icons'],
    license: 'MIT',
    copyright: 'Copyright (c) 2019-2024 The Bootstrap Authors',
    url: 'https://icons.getbootstrap.com/',
  },
  {
    id: 'tailwindcss',
    name: 'Tailwind CSS',
    packages: ['tailwindcss'],
    license: 'MIT',
    copyright: 'Copyright (c) Tailwind Labs, Inc.',
    url: 'https://tailwindcss.com/',
  },
  {
    id: 'tslib',
    name: 'tslib',
    packages: ['tslib'],
    license: '0BSD',
    copyright: 'Copyright (c) Microsoft Corporation',
    url: 'https://github.com/microsoft/tslib',
  },
];
