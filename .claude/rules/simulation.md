---
paths:
  - 'src/app/simulation/**'
---

# Simulation toolkit: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Determinism toolkit (AP 1.1) in `simulation/util`: `deriveSeedKey`/`normalizeSeed`, `createStream(seedKey, key)` (sfc32), distributions (`normal`, `poisson`, `weightedIndex`, `shuffle`, …), `detExp`/`detLog`, `Checksum` for golden masters and `generateSeed`. Simulation code uses these instead of `Math.random`/`Math.exp`/`Math.log`/`**`; an ESLint rule enforces this in `simulation`, `world`, `market` and `clock` (`domain`, `util`) and in `shared/domain` (money and price grid feed the simulation).
