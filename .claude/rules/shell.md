---
paths:
  - 'src/app/shell/**'
  - 'src/app/app.*'
  - 'src/main.ts'
  - 'src/index.html'
  - 'src/environments/**'
---

# Shell and bootstrap: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Bootstrap (AP 0.4, 6.3, 6.8a/b; TS §11.9, E-36)

- `main.ts` only runs `startLanguage` (`settings/data-access/language/language-start.ts`: reads `pgo.settings`, loads `assets/i18n/messages.en.json` for English — missing or invalid → German with a console warning —, `setFormatLanguage`, `<html lang>`), then imports `src/bootstrap.ts` dynamically, because `$localize` in module constants runs at import. Never import app code statically into `main.ts`. The bundle script counts that dynamic import (TS §14.3).
- `app.config.ts`: hash router, `provideAppCore()`, `provideServiceWorker` (flag `serviceWorker`, production only), devtools.
- `provideAppCore()` (`app.providers.ts`, also used by page tests): `PageTitleStrategy`, store, effects, router store, `LOCALE_ID` from `formatLanguage()` (`de`/`en-GB`), `APP_VERSION`, `ColorSchemeService`, `ToastService`, `EngineService`, players, settings and PWA state, and from the settings `CLOCK_SHORTCUTS_ENABLED`, `NOTIFICATION_CHANNEL_SETTINGS`, `VALUE_FLASH_ENABLED`.
- `src/index.html`: an inline script applies `pgo.settings` before Angular starts (`dark`, `colors-blue-orange`, `<html lang>`, `<link id="manifest">` → `manifest.en.webmanifest`); it mirrors `parseSettings`, change both together. `theme-color` meta (`#0b0f14`, then `ColorSchemeService`). Icons `src/assets/favicon.svg` (no `--` in XML comments, it makes the file invalid) and `apple-touch-icon.png` (180 px, rendered once from the SVG), linked relative to `<base href="./">`; test „icons“ in `e2e/shell.e2e.ts`.
- `AppComponent` renders `app-app-update` after the router outlet (`pwa.md`). Translations: `CLAUDE.md` §5.

## Routing (TS §11.4)

- `app.routes.ts`: `''`/`**` → `/players`; `players`, `about`, `help`, `game/:playerId` (→ `shell/feature/shell.routes.ts`), `lab` only with `devPages`. Routes set `title` via `$localize`.
- Game area: `ShellPage` with `providers: [provideShellState(), provideGameState()]` and guards `enterGame()`/`leaveGame()` (`engine/feature/state/session.guards.ts`; rerun when the player in the URL changes); children lazy-load each domain's routes (`dashboard` default, `markets`, `portfolio`, `accounts`, `banks`, `orders`, `taxes`, `notifications`, `settings`, `about`, `help`).

## Game session (AP 2.5, 6.4; TS §8.5)

- `provideGameState()` (`shell/feature/state/game-state.providers.ts`) registers every game slice exactly once.
- `enterGame`: missing, outdated or unreadable player → `/players` with a toast, else load with `minTick` from `pgo.lastTick`. Visibility and `pagehide` go to the engine; `pagehide` also writes `pgo.lastTick`.
- `shell/ui/session-overlay` while loading, catching up or failed (game area `inert`). `failed`: confirmed actions are stored, export hint (`shell.session-overlay.export-hint`), „Neu laden“ (`shell.session-overlay.reload` → `SessionFacade.reload()`: new worker, new failure count).
- `shell/ui/header`: clock bar and market status (`clock.md`), net worth from `md` (on phones the dashboard tile), bell, player menu `PLAYER_MENU_ACTIONS` (`header.model.ts`). Plus `side-nav`, `bottom-nav`.
- Tests: `shell.page.spec.ts`; `e2e/game-clock.e2e.ts`, `game-session.e2e.ts`, J10 `engine-performance.e2e.ts`.

## Command palette (AP 6.5; PS US-UI-05)

- `provideShellState()`: `ShellFacade` (no slice; reads router store and session), `ShellEffects`, `GLOSSARY_LINK`.
- Header button `shell.header.command-palette` (from `md` with `<kbd>Strg K</kbd>` and `aria-keyshortcuts` while shortcuts are on). `shortcut$`: Ctrl/Cmd+K (`isCommandPaletteShortcut`, `shell/domain`) only while ready, without an open dialog and with `CLOCK_SHORTCUTS_ENABLED`.
- `openCommandPalette$` opens `shell/feature/dialog-command-palette` with `commandPaletteData(...)` (`state/command-palette.utils.ts`; instruments and „<Name> kaufen …“ only with a query); `runCommand$` dispatches the clock, banking, trading and players actions, `navigate$` navigates.
- Own ARIA combobox (`shell.command-palette.input`, `.list`, `.option.<id>`, `.status`, `.close`); `rankSearch` (`shared/util/search-ranking.ts`), ≤ 30 hits, wrap-around. Test `command-palette.page.spec.ts`.
