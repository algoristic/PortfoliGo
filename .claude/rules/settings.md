---
paths:
  - 'src/app/settings/**'
  - 'src/index.html'
---

# Settings: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Model and storage (AP 2.6, 6.2, 6.8a; TS §9.3, §11.5, §11.9)

- `Settings` (`settings/domain`), one section per topic: `appearance` (`colorScheme`, default `dark` E-06; `changeColors`), `shortcuts`, `motion.priceHighlight`, `notifications` (per-code `toast`/`browser` overrides, `parseNotificationChannelOverrides` from `notifications/domain`), `locale.language` (`de`/`en`, `shared/util/locale.ts`). `parseSettings` replaces each missing or invalid value by its default, so new sections need no new version (`pgo.settings` stays v1).
- `SettingsService` (`pgo.settings` via `LocalStorageService`); `storedLanguage` in `language-start.ts` reads it the same way before bootstrap (`shell.md`).
- The inline script in `src/index.html` mirrors `parseSettings` (colour scheme, change colours, language, manifest): change both together.

## Slice (`settings/feature/state`)

- App-wide, `provideSettingsState()` in `provideAppCore()`, loaded by `provideAppInitializer` before the first route. `SettingsFacade` exposes one stream per setting plus `effectiveNotificationChannels$`; `provideAppCore()` derives `CLOCK_SHORTCUTS_ENABLED`, `VALUE_FLASH_ENABLED`, `NOTIFICATION_CHANNEL_SETTINGS` from it.
- Every change is saved; a failed save toasts, with `isQuotaExceeded` the storage-full text with export hint (TS §9.5). `applyColorScheme$`/`applyChangeColors$` call `ColorSchemeService`.
- Language: `selectedLanguage` → `saveLanguage$` → `reloadForLanguage$` via `APP_RELOAD` (`shared/data-access/app-reload`; tests: `provideRecordingAppReload`); a failed save doesn't reload. It takes effect only after the reload.
- Not in this slice: background behaviour (`clock` slice, `ClockFacade.setBackground`, `clock.md`), player name/seed (`session`), rename/copy/export (`PlayersFacade`).

## Page (`settings/feature/settings`)

- „Dieses Gerät“: `ui/device-settings` (language first, names „Deutsch“/„English“ untranslated with `lang`; colour scheme; change colours with sample `app-price-change`; price highlight; shortcuts — the switch also disables Ctrl/Cmd+K, only shortcuts without Ctrl rest while a control has focus), `ui/notification-channel-settings` (`settings.device.notifications.<code>.toast|browser`, no browser switch for `backup-reminder`).
- „Spieler“: `ui/player-profile` (rename, seed copy with `cdkCopyToClipboard`), `ui/player-settings` (background mode radios; speed select only for `custom-speed`; deadline select in every mode but `pause`; hint on real time when closed or frozen and on battery use), `ui/auto-pause-settings` (`notifications.md`), `players/ui/player-backup` (`players.md`).
- „App“ (`settings.app`): `pwa/ui/app-settings` (`pwa.md`, guard `enterAppSettings()`), then `about/ui/disclaimer-hint`.
- English texts follow the term list of TS §11.9.

## Tests

- `settings-logic.spec.ts`, `language-start.spec.ts`, effects spec; `settings.page.spec.ts` (all sections, reload with stored JSON, background deadline while hidden, `freeze`/`resume`, language reload; describe „app“ with `providePwaTestPorts`, `provideFakeNotificationPort`, `FakeStoragePersistence`; `installSystemColorScheme` fakes `prefers-color-scheme`).
- `e2e/settings.e2e.ts` (set appearance with `storeColorScheme` from `settings.po.ts`; the system preference alone doesn't decide it), `e2e/language.e2e.ts`.
