---
paths:
  - 'src/app/clock/**'
---

# Clock: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Time model (AP 1.2) in `clock/domain`: `Tick` = game minutes since 01.01.2020, `GAME_START_TICK`, calendar functions (`tickToDateTime`, `dateTimeToTick`, `weekday`, month/year boundaries, bank working days), trading hours (`isTradingTime`, `nextOpen`, `nextClose`), `SPEEDS`, `targetTick` and `formatGameTime`/`formatGameDate`. Convert time only via the `TICKS_PER_*` constants, never with literal `60`/`1440`.
- Clock slice and header (AP 2.5; system test `e2e/game-clock.e2e.ts`): the `clock` slice (`clock/feature/state`, `ClockFacade`: `clock$`, `tick$`, `speed$`, `paused$`, `overloaded$`, `jumping$`, `jumpTargetTick$`, `canFaster$`/`canSlower$`, `regionStatuses$`, `exchangeStatuses$`; `togglePause`, `setSpeed`, `faster`, `slower`, `openJump`, `cancelJump`; quick `+`/`−` go on from `requestedSpeed`), registered by `provideGameState()` (`shell/feature/state`) at the shell route. Shortcuts space/`+`/`−` (`clock/domain/clock-control-logic.ts`), switchable through the token `CLOCK_SHORTCUTS_ENABLED` (the settings slice provides it since AP 2.6). The header has two rows: the clock bar `clock/ui/clock-controls` (clock `shell.header.clock`, pause/resume, speed menu with all `SPEEDS` and „Vorspulen …“, jump progress with cancel) and the market status `clock/ui/market-status` (regions from `exchangeStatus`/`regionStatus` in `clock/domain/exchange-status-logic.ts`, exchanges loaded by `loadExchanges$` through `query({ kind: 'exchanges' })`; list in a CDK connected overlay); the jump dialog `clock/feature/dialog-jump` is opened by the effect `openJumpDialog$`.
- Region labels (AP 4.4): `clock/ui/labels/region-labels.ts` (`regionLabels`, `regionStatusText`, `exchangeChangeText`) hold the names and status texts of the regions for the header's market status and the markets page (IDs `uiClock-marketStatus-…` kept).
