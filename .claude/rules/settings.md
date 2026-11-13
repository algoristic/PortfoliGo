---
paths:
  - 'src/app/settings/**'
  - 'src/index.html'
---

# Settings: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Settings (AP 2.6): `settings/domain` (`Settings` with one section per topic, `appearance.colorScheme` `system`/`dark`/`light`, default `dark` (E-06), `shortcuts.enabled`; `parseSettings` replaces each missing or invalid value by its default, so later sections need no new version); `SettingsService` (`settings/data-access`, `pgo.settings` version 1 via `LocalStorageService`); app-wide `settings` slice (`provideSettingsState()` in `provideAppCore()`, loaded by `provideAppInitializer` before the first route; `SettingsFacade`: `colorScheme$`, `shortcutsEnabled$`; every change is saved, failures show a toast; `applyColorScheme$` calls `ColorSchemeService.apply`). The inline script in `src/index.html` mirrors `parseSettings` for the colour scheme: change both together (TS §9.3, §11.5). The player setting „Verhalten im Hintergrund“ lives in the `clock` slice (`ClockFacade.backgroundMode$`/`setBackgroundMode`, effect `setBackgroundMode$`, `requestedBackgroundMode` until a clock event confirms it). Page `settings/feature/settings` with `settings/ui/device-settings` and `settings/ui/player-settings`; page test `settings.page.spec.ts` (`installSystemColorScheme` in `src/testing/color-scheme.ts` fakes `prefers-color-scheme`), system test `e2e/settings.e2e.ts`; system tests set the appearance with `storeColorScheme` (`e2e/settings.po.ts`), since the system preference alone no longer decides it.
