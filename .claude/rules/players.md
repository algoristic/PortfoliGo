---
paths:
  - 'src/app/players/**'
---

# Players: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Domain (`players/domain`; AP 2.4, 6.1, PS US-SP-01, TS §9.1, §10)

- Profile (`seedKey` as `number[]`), limits, defaults and presets of US-SP-01; `livingCostsExceedIncome`, `matchingPreset`, `isOutdated` (against `SIM_VERSION`/`SCHEMA_VERSION`).
- Export format v1: `PlayerExport`, `EXPORT_FORMAT_VERSION`, `IMPORT_ERRORS` (`models/player-export.model.ts`), `player-export-logic.ts` (build, file name, encode/decode), guards `player-export.utils.ts`, `player-import-logic.ts`. Frozen fixture `testing/export-v1.ts` (regenerate before 1.0 with `UPDATE_EXPORT_FIXTURE=1`). Worker side: `engine.md`.
- `backup-logic.ts` (`backupReminderDue`, `parseBackupSettings`; `isInstant` checks only `Number.isFinite`, no conversion).

## PlayersService (`players/data-access`)

- List from the stores `players`, `runtime`, `snapshots`; create, rename, delete under the Web Lock (`PlayersServiceError` codes); `changes$` from other tabs; last player ID; `suggestSeed`. Storage work runs as `PendingTasks`; platform ports with root defaults, fakes via `providePlayersTestPorts()`.
- `requestPersistence` is not a pending task and doesn't block: Firefox answers only after its prompt.
- `importPlayer(content, suffix)`: worker first, then the profile; deletes the worker records if the profile fails. `exportPlayer(name)`. `pgo.backup` (last export, interval for all players of the device); deleting a player removes its entry.

## State and UI

- App-wide slice (`providePlayersState()` in `provideAppCore()`, `PlayersFacade`), guards `enterPlayersPage`/`leavePlayersPage`/`enterNewPlayerPage`. Pages „Spielerauswahl“ (`ui/player-list`, `players.list.import`) and „Spieler anlegen“ (`ui/form-new-player`, schemas in `ui/schemas`), both with `about/ui/disclaimer-hint`. Opening or creating a player remembers it and navigates to `/game/:id`.
- Dialogs from effects: `dialog-rename-player` (also `clickedRenameOpenPlayer` from settings, ID/name from the `session` slice), delete confirmation, `dialog-import-player` (file or text, `importRatio$`, toasts per error code and for a different market checksum), `dialog-export-player` (download via `FILE_DOWNLOAD`, CDK `Clipboard`; contents never pass the store). `exportPlayer()` serves settings and the game's player menu.
- `backup$` loads on `SessionActions.enterGame`; `remindBackup$` after `loadPlayerSuccess`, skipped while the `backup-reminder` toast is off (`NOTIFICATION_CHANNEL_SETTINGS`). `copiedSeed` → `showSeedCopied$`. `ui/player-backup` sits on the settings page.
- Tests: `players.page.spec.ts`, `players-import.page.spec.ts`, `new-player.page.spec.ts`, `players.effects.spec.ts`; export/backup in `settings.page.spec.ts` (movable `PLAYERS_CLOCK`).
