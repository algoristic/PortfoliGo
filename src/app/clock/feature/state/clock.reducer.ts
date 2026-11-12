import { Action, createReducer, on } from '@ngrx/store';

import { Tick } from '@app/clock/domain/models/time.model';
import { ClockPayload } from '@app/engine/data-access/service/engine-service.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';

import * as ClockActions from './clock.actions';

export const CLOCK_FEATURE_KEY = 'clock';

export interface ClockState {
  /** Last `clock` event of the loaded player (≤ 10/s, TS §8.4); `null` until the first. */
  clock: ClockPayload | null;
  /** Target of the running jump, from the reply to `jumpTo`. */
  jumpTargetTick: Tick | null;
  error?: unknown;
}

export const initialClockState: ClockState = { clock: null, jumpTargetTick: null };

const reducer = createReducer(
  initialClockState,
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialClockState),
  on(ClockActions.receivedClock, (state, { clock }) => ({ ...state, clock })),
  on(ClockActions.jumpToSuccess, (state, { targetTick }) => ({
    ...state,
    jumpTargetTick: targetTick,
  })),
  on(SessionActions.retrievedProgress, (state, { progress }) =>
    progress.kind === 'jump' && progress.state !== 'running'
      ? { ...state, jumpTargetTick: null }
      : state,
  ),
  on(ClockActions.clockCommandFailure, ClockActions.jumpToFailure, (state, { error }) => ({
    ...state,
    error,
  })),
);

export function clockReducer(state: ClockState | undefined, action: Action): ClockState {
  return reducer(state, action);
}
