import { createFeatureSelector, createSelector } from '@ngrx/store';

import { fasterSpeed, slowerSpeed } from '@app/clock/domain/clock-logic';

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
export const selectJumpTargetTick = createSelector(selectState, (state) => state.jumpTargetTick);

/** `false` at the end of `SPEEDS` and before the first clock event. */
export const selectCanFaster = createSelector(
  selectSpeed,
  (speed) => speed !== null && fasterSpeed(speed) !== speed,
);
export const selectCanSlower = createSelector(
  selectSpeed,
  (speed) => speed !== null && slowerSpeed(speed) !== speed,
);
