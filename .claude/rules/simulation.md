---
paths:
  - 'src/app/simulation/**'
---

# Simulation: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

- Determinism toolkit (AP 1.1) in `simulation/util`: `deriveSeedKey`/`normalizeSeed`, `createStream(seedKey, key)` (sfc32), distributions (`normal`, `poisson`, `weightedIndex`, `shuffle`, …), `detExp`/`detLog`, `Checksum` for golden masters and `generateSeed`. Simulation code uses these instead of `Math.random`/`Math.exp`/`Math.log`/`**`; an ESLint rule enforces this in `simulation`, `world`, `market` and `clock` (`domain`, `util`), in `shared/domain` (money and price grid feed the simulation) and in every other folder the engine worker bundles (TS §4.4; list `DETERMINISTIC_FILES` in `eslint.config.js`). It also catches `**=`, aliases of `Math`, `globalThis.`/`self.` access, `Date()`/`Date.parse` and locale functions (`localeCompare`, `toLocale*`, `Intl`); exceptions are `eslint-disable` comments with a reason.
- `withInexactMathTrap(run)` (`inexact-math-trap.ts`, list `INEXACT_MATH_FUNCTIONS`) makes the inexact `Math` functions throw while `run` runs; `computeGoldenChecksums` runs inside it, because V8 can't tell `detExp` from `Math.exp`. `det-math.spec.ts` checks `detExp`/`detLog` against the frozen table `testing/det-math-reference.ts` (input and result bits, exact value from Python `decimal`; < 1 ulp checked with `BigInt`); never regenerate it from `detExp`/`detLog`.
