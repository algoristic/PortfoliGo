---
paths:
  - 'src/app/lab/**'
  - 'src/app/charts/**'
  - 'src/app/analysis/**'
---

# Lab, charts and analysis: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Lab frame and simulation (AP 1.7, 1.8)

- `#/lab` (only with `devPages`, currently on in production too): `lab/feature/lab/lab.page` is the parent route (`''` → `simulation`, plus `components`, `tokens`) with header (brand, `lab/ui/lab-nav`, „Zur App“ link to `/players`). Child pages render inside its `<main>` and set no page background. New lab pages are child routes with a `title` and an entry in `LabPage.navItems`. The player selection links to the lab.
- `lab/domain`: `LabSimulation` (world, prehistory, day steps, candles from minute curves or, for long periods, from support points; `statistics(start)`, `simulateYears`, `measureSeedRun(seed, years)`). `lab/data-access`: `lab-simulation.worker.ts` around the framework-free `LabWorkerSession`, `LabSimulationService` with `LAB_WORKER_FACTORY` (test: `provideInProcessLabWorker()` in `lab/data-access/testing`). The `lab` slice in `lab/feature/state`. Web workers use `tsconfig.worker.json` (`*.worker.ts`).
- Statistics (measurement rules in TS §6.9): `collectMarketSample`/`MarketSampleCollector` (`market-sample.ts`: daily sample from recomputed days or while simulating via `advanceMarket` `onDay`, incl. overnight shares, long-term checkpoints, closes of the broad regional indices, yearly share states for the premiums and the highest close); `computeLabStatistics` against `CALIBRATION_TARGETS` (banded and info rows, labels in `lab/ui/market-statistics`); `computeIntradayStatistics` (last 63 market days: minute volatility, daily range, intraday profile in 13 parts, `ReferenceSimulation` for the largest exchange, throughput via an injected clock); `long-term-statistics.ts` (`checkpointDay`, `rollingWindows`); seed comparison `COMPARISON_SEEDS` (= `TEST_SEEDS.calibration`) with the test seam `LAB_SEED_COMPARISON`.
- All presentational parts live in `lab/ui`: `market-statistics` (`phase-timeline`, `return-histogram`, `correlation-matrix`), `intraday-statistics`, `long-term-statistics`, `seed-comparison`, `world-tables`, `series-chart`, `self-test` (the seven `GOLDEN_CHECKSUMS` incl. `worlds`, plus the row `player` against `PLAYER_CHECKSUM`; the worker's `golden` request returns `{ checksums, player, durationMs }`). Their tables use `appTable density="compact"` with `thead appTableHead` and `appTableCell` (AP 7.4); `correlation-matrix` stays raw.

## Statistics and indicators (`analysis/domain`; AP 1.8a, 4.3; TS §11.7)

- Framework-free `statistics-logic.ts` (volatility, correlation, kurtosis, autocorrelation, quantiles, histogram) and `drawdown-logic.ts` (`drawdownEpisodes`, `longestUnderwater`, `bearMarketCount`); reuse them for risk figures instead of new helpers. The engine worker uses them, so they follow the determinism rule (`detExp`/`detLog`, TS §4.4).
- `indicator-logic.ts`: SMA, EMA, SMMA, Bollinger over closes; `createIndicatorTracker(spec)` with `push`/`replaceLast`, bit-identical to `indicatorSeries(values, spec)` (window summed oldest first, no running sum); limits `INDICATOR_PERIOD_MIN`/`MAX` 2–200, `BOLLINGER_MULTIPLIERS` 0.5–4, `DEFAULT_INDICATOR_SPECS`, guard `isIndicatorSpec`. Models `models/indicator.model.ts`. Spec: TS §11.7 example table, brute-force reference, properties; in the mutation tests.

## Charts (`charts`; AP 4.2, 5.5b, 5.8; E-04, TS §11.7)

- `charts/ui/price-chart` wraps `lightweight-charts`, loaded via `PRICE_CHART_LIBRARY` (`price-chart.config.ts`, dynamic import by default, own lazy chunk); colours from the tokens (re-read on `<html>` class changes); game time on the time axis via `tickToChartTime`; German price axis.
- Inputs: chart type line/area/candles; `incrementalUpdates` (changed newest candle or one appended → `series.update`, else `setData`; prepended candles keep the view); `overlays` (`PriceChartOverlay`: `id`, `points`, `color` as `ChartColor` = `--pgo-chart-1` … `-6`, `lineStyle` `solid`/`dashed`, `fillTo` = points of a second line with the same ticks, filled at 12 % opacity by `band-fill.primitive.ts` `BandFillPrimitive`, `zOrder` `bottom`, detached when `fillTo` goes away); `markers` (`PriceChartMarker`: candle tick, `buy`/`sell`, text; via `createSeriesMarkers`, buy arrow up below in `up`, sell arrow down above in `down`, recreated with a new series); `loading` (skeleton above the canvases, `z-10`).
- Outputs `scrolledToStart`, `changedVisibleRange` (game time), `movedCrosshair` (candle and overlay values).
- Host attributes for tests: `data-candle-count`, `data-last-tick`, `data-overlay-points` (`id:count`), `data-overlay-colors` (`id:colour`), `data-overlay-fills`, `data-markers` (`kind:tick`). The component test wraps the real library to record `update`/`setData`/`remove`.
- SVG `charts/ui/sparkline` (reference line, colour by direction, `label` → `role="img"`, else `aria-hidden`) and `charts/ui/donut` (`ChartColor` segments; caller draws the legend with `CHART_COLOR_BACKGROUND_CLASSES`); geometry framework-free in `charts/util` (`sparkline-geometry.ts`, `donut-geometry.ts`; logic and mutation tests).
- `charts/ui/chart-color-picker`: `FormValueControl<ChartColor>`, native radio group named by `label`, swatches Blau, Orange, Grün, Violett, Türkis, Magenta, `testId` + `.<colour>`.
- Examples on `#/lab/components`; `#/lab/tokens` shows the chart colours with a 3:1 contrast check.
