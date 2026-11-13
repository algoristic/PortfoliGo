---
paths:
  - '**/*.spec.ts'
  - 'e2e/**'
  - 'src/testing/**'
---

# Testing: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Tests (AP 0.5, TS §14.1, §10): suites `logic` (Vitest under Node), `angular` (`ng test` under jsdom), `calibration`, `perf`, `mutation` (Stryker) and `e2e` (Playwright in Chromium, Firefox, WebKit and on phones, with axe). Helpers in `src/testing/` (`renderRoute`/`settle`, DOM helpers, `installChartPlatform`, `installViewport`, `statistics`, `perf`, `parse`, `arbitraries`, `seeds`), platform polyfills in `src/test-setup.ts`, `provideInProcessLabWorker()`; fixtures `goldenYear()`, `miniWorld()`/`miniMarket()`. The golden master lives in `market/domain/golden-master.ts` (six checksums of `golden-1`); the self-test on `#/lab/simulation` computes them in the worker, and the system tests compare them in every engine. Page tests: `shell/feature/shell`, `lab/feature/simulation`; component tests: `charts/ui/price-chart`, `shared/ui/tabs`, `shared/ui/dialog-confirm`.
- Page tests of the game area (AP 2.5; `shell/feature/shell/shell.page.spec.ts`, `players/feature/new-player`) run the worker code with `InProcessEngine({ storage: 'indexed-db', locks })` + `provideInProcessEngineWorker(engine)` + `providePlayersTestPorts({ locks: engine.locks })`; advance at least 200 ms after each action (clock events are throttled, loop passes every 16 ms) and read intermediate states after pausing; `config: { passBudgetMs: 0 }` makes a jump take several passes (`engine.timeline.step()`); the init overlay is only visible with `Router.navigateByUrl` + `detectChanges` (the harness would wait for the engine).
- Market area (AP 4.2–4.4): page tests `market/feature/instrument/instrument.page.spec.ts`, `markets/markets.page.spec.ts`, `screener/screener.page.spec.ts` and `watchlist/watchlist.page.spec.ts` (acceptance flow search, filters, sort and watchlist; live price after a jump to 10:00 with `installViewport(1024)`; a full list through `EngineService.updateWatchlist`); component tests `market/ui/form-indicator` and `shared/ui/value-flash`; `installScrollViewport` (`src/testing/scroll-viewport.ts`) for CDK virtual scrolling under jsdom; perf spec `screener-quotes.perf.spec.ts`. System test `e2e/markets.e2e.ts` (chart, overview, screener, watchlist with mouse drag and reload, 360 px). `npm run test:e2e` runs the J10 budgets (`@budget`) after the other system tests with `--workers=1`, because system tests running beside them distort the measurement.
