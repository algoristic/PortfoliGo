---
paths:
  - 'src/app/players/**'
---

# Players: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Players (AP 2.4): `players/domain` (profile with `seedKey` as `number[]`, list entry, limits, defaults and presets of PS US-SP-01, `livingCostsExceedIncome`, `matchingPreset`, `isOutdated` against `SIM_VERSION`/`SCHEMA_VERSION`); `PlayersService` (`players/data-access`: list from the `players`, `runtime` and `snapshots` stores, create, rename, delete under the Web Lock with `PlayersServiceError` codes, `changes$` from other tabs, `get/setLastPlayerId`, `requestPersistence` (not a pending task, requested by `requestPersistence$` without blocking: Firefox answers only after its prompt), `suggestSeed`; storage work runs as `PendingTasks`; platform ports with root defaults, fakes via `providePlayersTestPorts()` in `players/data-access/testing`); Signal-Forms schemas in `players/ui/schemas` (`playerNameSchema`, `newPlayerSchema`, `amountRangeSchema`); app-wide players slice `players/feature/state` (`PlayersFacade`; enter guards `enterPlayersPage`/`leavePlayersPage`/`enterNewPlayerPage`; rename dialog `players/feature/dialog-rename-player` and delete confirmation opened from effects); pages „Spielerauswahl“ (`players/ui/player-list`) and „Spieler anlegen“ (`players/ui/form-new-player`); opening or creating a player remembers it and navigates to `/game/:id` (loading it in the worker follows in AP 2.5).
