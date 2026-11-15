---
paths:
  - 'src/app/simulation/**'
---

# Simulation: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

- Determinism toolkit (AP 1.1) in `simulation/util`: `deriveSeedKey`/`normalizeSeed`, `createStream(seedKey, key)` (sfc32), distributions (`normal`, `poisson`, `weightedIndex`, `shuffle`, …), `detExp`/`detLog`, `Checksum` for golden masters and `generateSeed`. Simulation code uses these instead of `Math.random`/`Math.exp`/`Math.log`/`**`; an ESLint rule enforces this in `simulation`, `world`, `market` and `clock` (`domain`, `util`) and in `shared/domain` (money and price grid feed the simulation).
