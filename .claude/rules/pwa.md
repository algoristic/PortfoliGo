---
paths:
  - 'src/app/pwa/**'
  - 'ngsw-config.json'
  - 'src/manifest.webmanifest'
  - 'scripts/render-icons.mjs'
---

# PWA: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Service worker and manifest (AP 6.3, 6.8a, 6.8b; TS §13, E-05)

- `@angular/service-worker`, registered by `provideServiceWorker` in `app.config.ts` (`registerWhenStable:30000`), enabled by `environment.serviceWorker` (only `environment.prod.ts`); `angular.json` builds the worker only in `production`.
- `ngsw-config.json`: group `app` prefetches `index.html`, both manifests and every `*.css`/`*.js` (lazy chunks, both workers); group `assets` prefetches `assets/**` (incl. `assets/i18n/messages.en.json`, which `main.ts` fetches with `cache: 'no-cache'`) and `media/**/*.woff2` with `cacheQueryOptions.ignoreSearch` (Bootstrap Icons' font URL has a hash query; without it the font fails offline).
- Pitfall: `ngsw.json` paths are scope-relative (`./index.html`) only because the `production` configuration sets `"baseHref": "./"`; without it the generator writes `/index.html`, and in the subfolder deployment the worker fetches the domain root's files and stops with a hash mismatch (`EXISTING_CLIENTS_ONLY`).
- Manifests `src/manifest.webmanifest` and `src/manifest.en.webmanifest` (copied by `angular.json` as `manifest*.webmanifest`). The English one differs only in `lang` and `description` (same `id`, `start_url`, `scope`, icons, so it stays one installed app); `src/index.html` switches the `href` of `<link id="manifest">` for English. `index.html` also has the `theme-color` meta that `ColorSchemeService` sets from `--pgo-bg`.
- Icons `src/assets/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, rendered from `src/assets/favicon.svg` by `node scripts/render-icons.mjs` (Playwright Chromium, no image library); rerun after changing the SVG.

## Ports and rules

- `pwa/data-access/platform/platform.ts`, each with a root default: `PLATFORM_INFO` (`standalone`, `ios`), `INSTALL_PROMPT` (`WebInstallPrompt`: keeps the last `beforeinstallprompt` without `preventDefault`, `appinstalled`), `STORAGE_ESTIMATE` (`navigator.storage.estimate()`), `APP_UPDATE` (`SwAppUpdate` over an optional `SwUpdate`: `version-ready`/`unrecoverable`, `reload(activate)`). Persistence uses `STORAGE_PERSISTENCE` of the players.
- Test fakes `pwa/data-access/testing/fake-pwa-ports.ts`: `FakeInstallPrompt.offer()`, `FakeStorageEstimate`, `FakeAppUpdate.emit()`, `providePwaTestPorts`.
- `pwa/domain/pwa-logic.ts`: `installOffer` (table in TS §13), `isIosDevice`, `storageUsageRatio`; models in `models/pwa.model.ts`.

## State and UI

- App-wide slice `pwa` (`providePwaState()` in `provideAppCore()`, `provideAppInitializer` dispatches `enterApp`), `PwaFacade`: platform; `update` (`unrecoverable` is kept over a later `version-ready`); install availability and outcome; notification permission (read at start and on `enterAppSettings`, requested only from the click); storage status (read on `enterAppSettings` — guard `enterAppSettings()` on the settings route — and after `clickedRequestPersistentStorage`; a `PendingTask` while loading). Effects toast after `appinstalled` and on failures; `reload$` activates only a `version-ready`.
- `pwa/feature/app-update` (in `AppComponent`, every page) with `pwa/ui/update-banner` (`pwa.update`, `pwa.update.reload`; floats above the phone navigation).
- `pwa/ui/app-settings`: panel „App“ of the settings (test IDs `settings.app.*`: install, notifications, storage, persistence).
- `pwa/ui/pre-release-hint` (`pwa.pre-release-hint`, players page and settings); remove it with AP 6.6.

## Tests

- `pwa-logic.spec.ts`, `pwa.reducer.spec.ts`, `pwa.effects.spec.ts`; „app“ describe in `settings.page.spec.ts`.
- `e2e/pwa.e2e.ts` (manifests, icons, offline reload, settings, markets and new player offline) and `e2e/pwa-notifications.e2e.ts` (Chromium only); SW/notification setup of system tests: testing.md.
