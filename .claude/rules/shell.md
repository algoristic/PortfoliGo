---
paths:
  - 'src/app/shell/**'
  - 'src/app/app.*'
  - 'src/main.ts'
  - 'src/index.html'
  - 'src/environments/**'
---

# Shell and bootstrap: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Bootstrap: `main.ts` boots `AppComponent` with `app.config.ts`: hash router, devtools and `provideAppCore()` from `app.providers.ts` (`PageTitleStrategy`, store, effects, router store, `LOCALE_ID` `de`, `ColorSchemeService`, `ToastService`, `EngineService`, players state, settings state and `CLOCK_SHORTCUTS_ENABLED` from the settings), which page tests use as well. The colour scheme follows the settings: an inline script in `src/index.html` sets the `dark` class from `pgo.settings` before Angular starts, then the settings slice applies it.
- Routing and shell (AP 0.4): `''`/`**` → `/players`; the game area `/game/:playerId` (`shell/feature/shell.routes.ts`) lazy-loads the route files of the domains (TS §11.4). The player pages are real (AP 2.4); the pages of the game area are still placeholders in their target domain folders; fill them in place. Routes set `title` via `$localize`.
- Game session (AP 2.5; system tests `e2e/game-clock.e2e.ts`, `game-session.e2e.ts`, J10 `engine-performance.e2e.ts`): `provideGameState()` (`shell/feature/state`) registers the `session` slice (see `engine.md`) and the `clock` slice (see `clock.md`) once at the shell route. Guards `enterGame` (missing or outdated player → `/players` with a toast, else `loadPlayer` with `minTick` from `pgo.lastTick`) and `leaveGame`; overlay `shell/ui/session-overlay` while loading, catching up or failing (game area `inert`); visibility and `pagehide` go to the engine, `pagehide` also writes `pgo.lastTick` (`engine/domain/last-tick-logic.ts`; `deletePlayer` removes the entry). The header has two rows: the clock bar `clock/ui/clock-controls` and the market status `clock/ui/market-status` (see `clock.md`).
- `provideGameState()` registers `provideDashboardState()` as well (AP 5.7b); the dashboard page is real (see `dashboard.md`). The header keeps the net worth from `md`; on phones the dashboard tile shows it.
