---
paths:
  - 'src/app/clock/**'
---

# Clock: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Time model (`clock/domain`; AP 1.2, 6.8a; TS §11.9)

- `Tick` = game minutes since 01.01.2020, `GAME_START_TICK`; calendar (`tickToDateTime`, `dateTimeToTick`, `weekday`, month/year boundaries, bank working days), trading hours (`isTradingTime`, `nextOpen`, `nextClose`), `SPEEDS`, `targetTick`. Convert only via `TICKS_PER_*`, never literal `60`/`1440`.
- `formatGameTime`, `formatGameWeekdayTime`, `formatGameDate` use `perLocale` (`shared/util/locale.ts`), always UTC: de `Mo., 01.04.2030, 09:41`; en `Mon, 01/04/2030, 09:41`, `Mon 09:41`, `01/04/2030`. Date inputs stay ISO (`game-time-input.ts`). Pipes in `clock/ui/pipes`.
- `exchange-status-logic.ts` (`exchangeStatus`, `regionStatus`), `clock-control-logic.ts` (shortcuts).

## Clock slice (`clock/feature/state`; AP 2.5, 6.7)

- Registered by `provideGameState()` (`shell/feature/state`) at the shell route. `ClockFacade`: `clock$`, `tick$`, `speed$`, `effectiveSpeed$`, `paused$`, `autoPause$`, `overloaded$`, `jumping$`, `jumpTargetTick$`, `canFaster$`/`canSlower$`, `regionStatuses$`, `exchangeStatuses$`, `background$`, `shortcutsEnabled$`; `togglePause`, `pause`, `resume`, `setSpeed`, `faster`, `slower` (quick `+`/`−` go on from `requestedSpeed`), `openJump`, `jumpTo(target)`, `cancelJump`, `setBackground(change)`.
- Shortcuts space/`+`/`−`, switchable via token `CLOCK_SHORTCUTS_ENABLED` (provided by the settings slice).
- `loadExchanges$` loads exchanges through `query({ kind: 'exchanges' })`; effect `openJumpDialog$` opens `clock/feature/dialog-jump`.
- Background mode: `selectedBackgroundMode` takes `{ mode, speed?, pauseAfter? }` (`BackgroundSettingsChange`, `engine/domain/models/game-state.model.ts`); `requestedBackground` merges sent values until a clock event confirms all of them (`confirmsBackground` in `clock.utils.ts`); `selectBackground` (`BackgroundSettings`); the effect calls `setBackgroundMode(mode, { speed?, pauseAfter? })`.

## Clock bar and market status (`clock/ui`; AP 2.5, 4.4, 5.9)

- Header row 1, `clock/ui/clock-controls`: clock `shell.header.clock`, pause/resume, speed menu (all `SPEEDS` + „Vorspulen …“), jump progress with cancel. Row 2, `clock/ui/market-status`: regions, exchange list in a CDK connected overlay.
- **Stable layout:** the game time is a grid stack of the current time plus invisible `aria-hidden` copies of one fixed week (`weekTicks` from `GAME_START_TICK`), so it is as wide as its widest weekday; the status chip („Pausiert“, „Pausiert: <Grund>“, „ausgelastet“) follows all buttons. Keep new variable-width elements behind the buttons so nothing moves the pause button or speed menu.
- Labels: `labels/region-labels.ts` (`regionLabels`, `regionStatusText`, `exchangeChangeText`; IDs `uiClock-marketStatus-…`, also used by the markets page), `labels/speed-labels.ts` (`speedLabel`, IDs `uiClock-clockControls-speed…`, also used by player settings).
- System tests `e2e/game-clock.e2e.ts`, `e2e/clock-layout.e2e.ts` (desktop and 360 px).
