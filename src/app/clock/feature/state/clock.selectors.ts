import { createFeatureSelector, createSelector } from '@ngrx/store';

import { fasterSpeed, slowerSpeed } from '@app/clock/domain/clock-logic';
import { exchangeStatus, regionStatus } from '@app/clock/domain/exchange-status-logic';
import { ClockControlState } from '@app/clock/domain/models/clock-control.model';
import { TradingHours } from '@app/clock/domain/models/time.model';
import {
  ExchangeStatusEntry,
  MARKET_STATUS_REGIONS,
  RegionStatusEntry,
} from '@app/clock/ui/market-status/market-status.model';
import { BackgroundSettings } from '@app/engine/domain/models/game-state.model';

import { CLOCK_FEATURE_KEY, ClockState } from './clock.reducer';

const selectState = createFeatureSelector<ClockState>(CLOCK_FEATURE_KEY);

export const selectClock = createSelector(selectState, (state) => state.clock);
export const selectTick = createSelector(selectClock, (clock) => clock?.tick ?? null);
export const selectSpeed = createSelector(selectClock, (clock) => clock?.speed ?? null);
export const selectPaused = createSelector(selectClock, (clock) => clock?.paused ?? null);
export const selectEffectiveSpeed = createSelector(
  selectClock,
  (clock) => clock?.effectiveSpeed ?? null,
);
export const selectOverloaded = createSelector(selectClock, (clock) => clock?.overloaded ?? false);
export const selectJumping = createSelector(selectClock, (clock) => clock?.jumping ?? false);
/** The notification an auto-pause stopped at, while it holds the game (TS §3.6, §12). */
export const selectAutoPause = createSelector(selectClock, (clock) => clock?.autoPause ?? null);
/**
 * The player's background settings (TS §3.6), the ones last sent until the engine reports them;
 * `null` before the first clock event.
 */
export const selectBackground = createSelector(
  selectClock,
  selectState,
  (clock, { requestedBackground: requested }): BackgroundSettings | null =>
    clock === null
      ? null
      : {
          mode: requested?.mode ?? clock.backgroundMode,
          speed: requested?.speed ?? clock.backgroundSpeed,
          pauseAfter:
            requested?.pauseAfter === undefined ? clock.backgroundPauseAfter : requested.pauseAfter,
        },
);
export const selectJumpTargetTick = createSelector(selectState, (state) => state.jumpTargetTick);

/** What the clock controls go on from: the clock event with the speed last sent (`requestedSpeed`). */
export const selectControlState = createSelector(
  selectClock,
  selectState,
  (clock, state): ClockControlState | null =>
    clock === null ? null : { speed: state.requestedSpeed ?? clock.speed, paused: clock.paused },
);

/** `false` at the end of `SPEEDS` and before the first clock event. */
export const selectCanFaster = createSelector(
  selectSpeed,
  (speed) => speed !== null && fasterSpeed(speed) !== speed,
);
export const selectCanSlower = createSelector(
  selectSpeed,
  (speed) => speed !== null && slowerSpeed(speed) !== speed,
);

export const selectExchanges = createSelector(selectState, (state) => state.exchanges);

/** Trading hours of all exchanges, for the jump target `next-open` (TS §3.7). */
export const selectJumpSessions = createSelector(selectExchanges, (exchanges) =>
  (exchanges ?? []).map(({ open, close }): TradingHours => ({ open, close })),
);

/** Every exchange with its status at the current tick, grouped by region in display order. */
export const selectExchangeStatuses = createSelector(
  selectExchanges,
  selectTick,
  (exchanges, tick): ExchangeStatusEntry[] => {
    if (exchanges === null || tick === null) {
      return [];
    }
    return MARKET_STATUS_REGIONS.flatMap((regionId) =>
      exchanges
        .filter((exchange) => exchange.regionId === regionId)
        .map(({ id, name, open, close }) => ({
          id,
          name,
          regionId,
          status: exchangeStatus({ open, close }, tick),
        })),
    );
  },
);

/** The four region displays of the header (TS §3.3); regions without exchanges are left out. */
export const selectRegionStatuses = createSelector(
  selectExchanges,
  selectTick,
  (exchanges, tick): RegionStatusEntry[] => {
    if (exchanges === null || tick === null) {
      return [];
    }
    return MARKET_STATUS_REGIONS.flatMap((regionId) => {
      const sessions = exchanges.filter((exchange) => exchange.regionId === regionId);
      const status = regionStatus(sessions, tick);
      return status === null ? [] : [{ regionId, status }];
    });
  },
);
