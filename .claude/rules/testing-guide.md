---
paths:
  - '**/*.spec.ts'
  - 'e2e/**'
  - 'src/testing/**'
  - 'stryker.config.mjs'
  - 'vitest*.config.ts'
  - 'playwright.config.ts'
---

# Testing: how to write tests

Rules for writing tests, the detail of `CLAUDE.md` §10 (oracle rule, which test goes where, planning tests). The test concept is TS §14.1; what exists is in `testing.md`.

## Principles

- **Oracles in detail:** worked examples from the spec are tables in TS or PS that the test implements exactly. Published reference vectors: MurmurHash3, sfc32, ISIN check digits. Independent references: `Date.UTC`, `Math.exp` within 1 ulp, a brute-force implementation inside the spec, `ReferenceSimulation`. Frozen checksums: `market/domain/golden-master.ts`. If you can't name the bug a test would catch, don't write it; Stryker measures this for rule code.
- **Behaviour at the boundary of a unit:** public functions, engine commands, slices (actions → state), pages (user actions → what the page shows). No tests of private helpers.
- **Deterministic and independent:** fixed seeds; no wall clock (`performance.now` and `Date.now` are lint errors outside `*.perf.spec.ts`) and no `Math.random`; no order dependence between tests (a flow over several steps is one test); never `.only`. Heavy setup goes in `beforeAll`, never in a `describe` body. Shared fixtures are read-only.
- **Not tested on their own:** third-party libraries, besides the list in `CLAUDE.md` §10.

## Which test goes where

| Code                                                                                                                       | Test                                                                                            | File                                                       | Suite         |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------- |
| Rules in `domain`/`util` (money, calendar, fees, interest, taxes, orders, indicators)                                      | example table from the spec (`it.each`, comment with the section) plus properties               | `<name>.spec.ts` next to the file                          | `logic`       |
| Invariants (rounding, price grid, ledger balance, round trips, type guards)                                                | fast-check properties                                                                           | same                                                       | `logic`       |
| Simulation code (world, market, engine)                                                                                    | determinism contract (TS §4.6): golden master plus properties on the mini world                 | same; `golden-master.spec.ts`, `market-properties.spec.ts` | `logic`       |
| Statistical plausibility, calibration targets                                                                              | tolerances in standard errors on fixed seeds                                                    | `<name>.calibration.spec.ts`                               | `calibration` |
| Budgets of TS §14.3                                                                                                        | median timings                                                                                  | `<name>.perf.spec.ts`                                      | `perf`        |
| Engine behaviour                                                                                                           | one scenario per acceptance criterion against the scripted market, `US-xx-nn` in the `describe` | `<name>.spec.ts`                                           | `logic`       |
| Reducers, selectors and effects with logic; services; guards with logic                                                    | slice and service tests                                                                         | `<name>.<kind>.spec.ts`                                    | `angular`     |
| Pages; ui components with their own behaviour (charts, forms with validation, keyboard handling)                           | page and component tests (below)                                                                | `<name>.page.spec.ts`, `<name>.component.spec.ts`          | `angular`     |
| What only a real browser shows (worker, media queries, IndexedDB, tabs, offline, `Intl`, a11y, determinism across engines) | system tests (below)                                                                            | `e2e/<area>.e2e.ts`                                        | `e2e`         |
| Rule code                                                                                                                  | mutation tests                                                                                  | `stryker.config.mjs`, `vitest.mutation.config.ts`          | `mutation`    |

- Specs in `domain` and `util` run in plain Vitest under Node (`vitest.config.ts`), so they must not import Angular, NgRx, RxJS or the DOM helpers (lint rule). All other specs run through `ng test` under jsdom. The globals `describe`, `it`, `expect` and `vi` exist in both.
- New rule code goes into one shard of `MUTATION_SHARDS` in `stryker.config.mjs` (the one with the fewest mutants), and its spec into `RULE_SPECS` in `vitest.mutation.config.ts`.

## Writing tests

- Structure: `describe('<ClassOrFunction>')`, nested `describe` per method or effect, and `it('<verb>s … when …')` in English without "should".
- **Example tables** cite the section they come from:

  ```ts
  // TS §7.1: commercial rounding, halves away from zero
  it.each([
    [2.5, 3],
    [-2.5, -3],
    [2.4999, 2],
  ])('rounds %d to %d', (value, expected) => {
    expect(roundHalfAwayFromZero(value)).toBe(expected);
  });
  ```

- **Properties** with fast-check (`import fc from 'fast-check'`; `fc.assert(fc.property(arbitrary, (x) => { expect(…) }))`):
  - Locally every run draws a new seed; CI uses `FC_SEED` derived from the commit. A failure prints seed and path; reproduce with `FC_SEED=<seed> npx vitest run <file>`. A counterexample that revealed a bug becomes an explicit example test.
  - Keep exhaustive loops where the input set is finite and small enough (every calendar day 2020–2100 against `Date`).
  - Shared generators live in `src/testing/arbitraries.ts`. Expensive properties set `numRuns` (10–25 on the mini world).
- **Statistical tolerances** are multiples of a standard error: `expectWithinSigma(observed, expected, se, k)` with `meanSe`, `binomialSe`, `poissonSe` or `varianceSe` from `src/testing/statistics.ts`. Use `analysis/domain/statistics-logic` instead of writing statistics helpers.
- **Fixtures:**
  - `goldenYear()` (`market/domain/testing/golden-year.ts`): the standard world of `golden-1` through 2020, once per file.
  - `miniWorld()` / `miniMarket()` (`world/domain/testing/mini-world.ts`, `market/domain/testing/mini-market.ts`): a small world for properties with many runs.
  - Seeds from `src/testing/seeds.ts`. Fixtures live in a `testing/` folder of their domain (excluded from the app build) or in `src/testing`.
  - Stored data: one frozen fixture per database version (`db-vN.json`), never changed after a release.
- **Golden master:** the six checksums live in `market/domain/golden-master.ts`. If one changes, the world or the prices of existing seeds changed. Update a constant only on purpose, note it in the change log (`docs/aenderungsprotokoll.md`) and raise `SIM_VERSION` (TS §15).
- **Mutation and `beforeAll`:** Stryker runs only the code inside `it` under the active mutant. In rule specs the mutated code must therefore run inside the test; only fixtures that are not mutated belong in `beforeAll`.
- **Mocks** (slice and service tests only): plain objects with `vi.fn()`, typed `Mocked<Pick<…>>` (`import type { Mocked } from 'vitest'`). Await Observables with `firstValueFrom`/`lastValueFrom`; no `done` callbacks, marble tests or `fakeAsync`.
- **Angular suite, what and how:**
  - **Reducers:** call directly with an action; only branches with logic.
  - **Selectors with logic:** `selectX.projector(state)`.
  - **Effects with logic** (filters, branches, error mapping, cancellation): `provideMockActions(() => actions$.asObservable())` with a `Subject<Action>`, mocked services as `{ provide: XService, useValue: service }`, `const result = firstValueFrom(effects.x$)` before `actions$.next(…)`, then `expect(await result).toEqual(…)`. Example: `src/app/players/feature/state/players.effects.spec.ts`.
  - **HTTP services:** `provideHttpClient()` + `provideHttpClientTesting()` with `HttpTestingController`, and `httpMock.verify()` in `afterEach`.
  - **Guards with logic:** `TestBed.runInInjectionContext(() => guard()(route, state))` + `firstValueFrom`.
  - **Reusable form schemas and rules:** create the form with `TestBed.runInInjectionContext(() => form(signal(model), schema))` and assert on `xForm.field().errors()`.

## Page and component tests

They run the real code: store, effects, facades, services, worker code, child components and `lightweight-charts`. Only process and platform boundaries are replaced, so don't mock anything else in them (no `MockStore`, fake services or stub components).

- **Page tests** (`<name>.page.spec.ts`) open the page through the app's real routes with `renderRoute(url, providers)` from `src/testing/page.ts`. It uses `provideAppCore()` (the app-wide providers of `app.config.ts`) and `RouterTestingHarness`, so guards and route providers run as in the app.
- **Component tests** (`<name>.component.spec.ts`) create the component with `TestBed.createComponent`, set inputs with `fixture.componentRef.setInput(...)` and subscribe to the outputs. Components that take content (e.g. `app-tabs` with `appTabPanel` templates) get a small host component in the spec; overlays (dialogs, toasts) are found in `document.body`.
- Replaced boundaries:
  - **Web Worker:** the same session code in the test process, provided at the root injector, e.g. `provideInProcessLabWorker()` (`lab/data-access/testing/`). Worker factory tokens therefore have a root default instead of being route providers.
  - **IndexedDB:** `fake-indexeddb`.
  - **Canvas, layout, `ResizeObserver`:** polyfills in `src/test-setup.ts` (2D context without drawing, silent observer); `installChartPlatform()` (`src/testing/chart-platform.ts`) for container size and colour tokens.
  - **Viewport (media queries):** `installViewport(width)` (`src/testing/viewport.ts`), called before `renderRoute`; without it no media query matches (phone layout).
  - **Clocks, randomness:** deterministic clocks; tests type seeds instead of generating them.
- Act like a user through `data-testid` with the helpers in `src/testing/dom.ts` (`byTestId`, `queryByTestId`, `textOf`, `click`, `typeText`, `select`, `press`, `wheel`) and assert on what the page shows. Displayed values that a test reads get a `data-testid` too.
- Wait with `settle(fixture)` (`src/testing/page.ts`): `whenStable()`, a few animation frames (charts report their range in a frame), `whenStable()` again. Asynchronous work outside Angular (worker answers, lazy libraries) is registered as `PendingTasks`, so `whenStable()` covers it; don't poll.
- **Expected values** are literal texts, dates and counts (derived from the calendar or the spec), or come from the public domain or engine API, e.g. a `LabSimulation` with the same seed for model numbers. Never import the page's formatting functions or state utils (`shared/util/format`, `clock/domain/game-time-format`, `*/state/*.utils`; enforced by lint). Read displayed numbers with `parseGermanNumber` (`src/testing/parse.ts`) and compare at the displayed precision.
- Page tests cover user flows and the wiring; edge cases stay in the logic tests. Layout, real media queries, real gestures and focus handling belong to the system tests.

## System tests (Playwright)

- Files are `e2e/<area>.e2e.ts`. Import `test` and `expect` from `e2e/fixtures.ts`: its automatic fixture fails a test on console errors, uncaught exceptions and failed requests, and `expectAccessible(page)` runs axe (WCAG 2.2 AA, serious and critical findings).
- They run against the production build (`e2e/serve.mjs` serves `www/`). Projects and tags:
  - `chromium`, `firefox`, `webkit` run every test without `@phone`;
  - `@mobile` adds `mobile-chromium` and `mobile-webkit`, `@phone` restricts a test to them;
  - `@intl` adds `chromium-intl` (en-US, Los Angeles), because output must be de-DE and UTC regardless of the browser.
- Select with `page.getByTestId(...)`. Assert texts and values derived from the calendar or the page structure, never model numbers: they change with every calibration. For determinism across engines, compare with the frozen constants (`GOLDEN_CHECKSUMS`).
- Control time only through product features (pause, simulate, jump) and assert in the resting state. No `waitForTimeout`. Let a page finish loading before a reload or navigation that could cancel a lazy chunk.
- Add or extend a journey whenever an AP adds behaviour that only a real browser shows: the worker, persistence across reloads, several tabs, offline use, file download and upload, layout breakpoints, focus handling, output in other engines. Run a new journey locally with `--repeat-each=5` before keeping it.
- Locally, `npm run e2e` and `npm run verify` run only the Chromium projects (`npm run test:e2e`). Firefox, WebKit and `mobile-webkit` run in CI (Playwright container); to run them locally, install their system libraries once (`sudo npx playwright install-deps`) and call `npx playwright test`.

## Mutation tests

- `npm run test:mutation` runs Stryker incrementally over all shards; the report is `reports/mutation/index.html`. CI runs one job per shard (`MUTATION_SHARD`) and fails when `tools/mutation-score.mjs` finds the score of all shards below `BREAK_THRESHOLD` in `stryker.config.mjs`.
- Kill surviving mutants in changed rule code with a new test, or explain in the AP why a mutant is equivalent.
