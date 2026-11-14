---
paths:
  - 'src/app/settings/**'
  - 'src/index.html'
---

# Settings: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Settings (AP 2.6): `settings/domain` (`Settings` with one section per topic, `appearance.colorScheme` `system`/`dark`/`light`, default `dark` (E-06), `shortcuts.enabled`; `parseSettings` replaces each missing or invalid value by its default, so later sections need no new version); `SettingsService` (`settings/data-access`, `pgo.settings` version 1 via `LocalStorageService`); app-wide `settings` slice (`provideSettingsState()` in `provideAppCore()`, loaded by `provideAppInitializer` before the first route; `SettingsFacade`: `colorScheme$`, `shortcutsEnabled$`; every change is saved, failures show a toast; `applyColorScheme$` calls `ColorSchemeService.apply`). The inline script in `src/index.html` mirrors `parseSettings` for the colour scheme: change both together (TS §9.3, §11.5). The player setting „Verhalten im Hintergrund“ lives in the `clock` slice (`ClockFacade.background$`/`setBackground`, effect `setBackgroundMode$`, `requestedBackground` until a clock event confirms it; AP 6.7). Page `settings/feature/settings` with `settings/ui/device-settings` and `settings/ui/player-settings`; page test `settings.page.spec.ts` (`installSystemColorScheme` in `src/testing/color-scheme.ts` fakes `prefers-color-scheme`), system test `e2e/settings.e2e.ts`; system tests set the appearance with `storeColorScheme` (`e2e/settings.po.ts`), since the system preference alone no longer decides it.
- Background modes (AP 6.7): `settings/ui/player-settings` takes `background` (`BackgroundSettings`) and emits `selectedBackground` (`BackgroundSettingsChange`): four modes as radios, the speed select (`settings.player.background-speed`, all `SPEEDS`) only in `custom-speed`, the deadline select (`settings.player.background-pause-after`, `off` or minutes) in every mode but `pause`, and a hint on real time when closed or frozen and on battery use. The page calls `ClockFacade.setBackground`; page tests in `settings.page.spec.ts` (speed and deadline after a reload, pause at the deadline tick while hidden, `freeze`/`resume`).
