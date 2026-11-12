import { Action, createReducer, on } from '@ngrx/store';

import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { ClockPayload, ExchangeInfo } from '@app/engine/data-access/service/engine-service.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';

import * as ClockActions from './clock.actions';

export const CLOCK_FEATURE_KEY = 'clock';

export interface ClockState {
  /** Last `clock` event of the loaded player (≤ 10/s, TS §8.4); `null` until the first. */
  clock: ClockPayload | null;
  /**
   * Speed sent to the engine and not yet confirmed: quick `+`/`−` presses go on from it instead of
   * from the clock event, which lags behind the engine.
   */
  requestedSpeed: SpeedId | null;
  /** Target of the running jump, from the reply to `jumpTo`. */
  jumpTargetTick: Tick | null;
  /** Exchanges of the loaded player's world with their trading hours (TS §3.3); `null` until loaded. */
  exchanges: ExchangeInfo[] | null;
  error?: unknown;
}

export const initialClockState: ClockState = {
  clock: null,
  requestedSpeed: null,
  jumpTargetTick: null,
  exchanges: null,
};

const reducer = createReducer(
  initialClockState,
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialClockState),
  on(ClockActions.receivedClock, (state, { clock }) => ({ ...state, clock })),
  on(ClockActions.requestedSpeed, (state, { speed }) => ({ ...state, requestedSpeed: speed })),
  on(ClockActions.setSpeedSuccess, (state, { speed }) =>
    state.requestedSpeed === speed ? { ...state, requestedSpeed: null } : state,
  ),
  on(ClockActions.jumpToSuccess, (state, { targetTick }) => ({
    ...state,
    jumpTargetTick: targetTick,
  })),
  on(SessionActions.retrievedProgress, (state, { progress }) =>
    progress.kind === 'jump' && progress.state !== 'running'
      ? { ...state, jumpTargetTick: null }
      : state,
  ),
  on(ClockActions.retrievedExchanges, (state, { exchanges }) => ({ ...state, exchanges })),
  on(ClockActions.clockCommandFailure, (state, { error }) => ({
    ...state,
    requestedSpeed: null,
    error,
  })),
  on(ClockActions.jumpToFailure, ClockActions.loadExchangesFailure, (state, { error }) => ({
    ...state,
    error,
  })),
);

export function clockReducer(state: ClockState | undefined, action: Action): ClockState {
  return reducer(state, action);
}
