---
paths:
  - 'src/app/lab/**'
  - 'src/app/charts/**'
  - 'src/app/analysis/**'
---

# Lab, charts and analysis: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Simulation lab (AP 1.7) at `#/lab/simulation` (only with `devPages`, currently on in production too): `lab/domain` (`LabSimulation`: world, prehistory, day steps, candles from minute curves or, for long periods, from the support points), `lab/data-access` (`lab-simulation.worker.ts` around the framework-free `LabWorkerSession`, `LabSimulationService` with `LAB_WORKER_FACTORY`; precursor of AP 2.2) and the `lab` slice. `charts/ui/price-chart` wraps `lightweight-charts` (E-04, loaded with a dynamic import, colours from the tokens, game time on the time axis via `tickToChartTime`); AP 4.2 extends it. Web workers use `tsconfig.worker.json` (`*.worker.ts`).
- Lab frame: `lab/feature/lab/lab.page` is the parent route of `#/lab` (`''` → `simulation`) with a header (brand, `lab/ui/lab-nav` with Simulation, UI-Bausteine, Design-Tokens, and a „Zur App“ link to `/players`); lab pages render inside its `<main>` and don't set their own page background. The player selection links to the lab. New lab pages are child routes with a `title` and a nav entry in `LabPage.navItems`.
- Lab statistics (AP 1.8a): `analysis/domain` holds framework-free statistics (`statistics-logic.ts`: volatility, correlation, kurtosis, autocorrelation, quantiles, histogram; `drawdown-logic.ts`); reuse them for later risk figures instead of writing new helpers. `lab/domain`: `collectMarketSample` (daily closes and returns from the support points), `computeLabStatistics` against `CALIBRATION_TARGETS` (measurement rules in TS §6.9), `LabSimulation.statistics(start)`/`simulateYears`; the page shows them with `lab/ui/market-statistics` (parts: `phase-timeline`, `return-histogram`, `correlation-matrix`). All presentational parts of the lab pages live in `lab/ui`.
- Lab intraday, long term and seed comparison (AP 1.8b): `MarketSampleCollector` (`lab/domain/market-sample.ts`) collects the daily sample from recomputed days (`collectMarketSample`) or while simulating (`advanceMarket` `onDay`), including overnight shares and the long-term checkpoints; `computeIntradayStatistics` (last 63 market days: minute volatility, daily range, intraday profile in 13 parts, `ReferenceSimulation` for the largest exchange, throughput via an injected clock); `long-term-statistics.ts` (`checkpointDay`, `rollingWindows`); `LabSimulation.measureSeedRun(seed, years)` for the seed comparison (`COMPARISON_SEEDS` = `TEST_SEEDS.calibration`; `LAB_SEED_COMPARISON` token as test seam). UI parts: `lab/ui/intraday-statistics`, `long-term-statistics`, `seed-comparison`. Measurement rules and results in TS §6.9.
