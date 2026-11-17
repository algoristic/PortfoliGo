---
paths:
  - 'src/app/world/**'
---

# World: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

- World generation (AP 1.3) in `world/domain`: `generateWorld(seedKey, config = DEFAULT_WORLD_CONFIG)` builds the fixed taxonomy (`taxonomy.ts`) plus seed-generated companies, index and ETF master data, issuers and banks; `worldChecksum` for golden-master tests (`golden-1` and the 200 seeds of `worldsChecksum`, see `market.md`). Sectors are drawn per company, so a sector can stay empty (about 1 in 8,000 worlds, e.g. `empty-13280`): its index and ETFs are left out (21 indices, TS §5.5) until AP 7.3d. Bank condition types live in `banking/domain/models/bank-conditions.model.ts`. Generated names go through `NameRegistry` (blocklist of real names, unique cores).
