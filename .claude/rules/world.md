---
paths:
  - 'src/app/world/**'
---

# World: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

- World generation (AP 1.3) in `world/domain`: `generateWorld(seedKey, config = DEFAULT_WORLD_CONFIG)` builds the fixed taxonomy (`taxonomy.ts`) plus seed-generated companies, index and ETF master data, issuers and banks; `worldChecksum` for golden-master tests (`golden-1` and the 200 seeds of `worldsChecksum`, see `market.md`). Countries and industries are allocated by largest remainder and shuffled (AP 7.3d, 7.1a-03), so every sector has shares and every world 22 indices. Dividend yields of payers are uniform in the industry range × style factor with both ends capped before the draw (no pile-up at `maxDividendYield`, 7.1a-09); non-payers start on the first of a later month (`startDay > 0`, 7.1a-10). Bank condition types live in `banking/domain/models/bank-conditions.model.ts`. Generated names go through `NameRegistry` (blocklist of real names, unique cores).
