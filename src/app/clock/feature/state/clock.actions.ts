import { createAction, props } from '@ngrx/store';

import { ClockShortcut } from '@app/clock/domain/models/clock-control.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { ClockPayload, ExchangeInfo } from '@app/engine/data-access/service/engine-service.model';
import { BackgroundSettingsChange } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';

export const clickedTogglePause = createAction('[Clock/Page] Clicked toggle pause');
export const clickedPause = createAction('[Clock/Page] Clicked pause');
export const clickedResume = createAction('[Clock/Page] Clicked resume');
export const selectedSpeed = createAction(
  '[Clock/Page] Selected speed',
  props<{ speed: SpeedId }>(),
);
export const clickedFaster = createAction('[Clock/Page] Clicked faster');
export const clickedSlower = createAction('[Clock/Page] Clicked slower');
export const pressedClockShortcut = createAction(
  '[Clock/Page] Pressed clock shortcut',
  props<{ shortcut: ClockShortcut }>(),
);
export const clickedJump = createAction('[Clock/Page] Clicked jump');
export const submittedJump = createAction(
  '[Clock/Page] Submitted jump',
  props<{ target: JumpTarget }>(),
);
export const clickedCancelJump = createAction('[Clock/Page] Clicked cancel jump');
/** Player setting of the settings page (PS US-UI-09, TS §3.6): mode, speed and deadline. */
export const selectedBackgroundMode = createAction(
  '[Clock/Page] Selected background mode',
  props<BackgroundSettingsChange>(),
);

export const receivedClock = createAction(
  '[Clock/API] Received clock',
  props<{ clock: ClockPayload }>(),
);
/** A speed was sent to the engine; the slice goes on from it until the engine confirms it. */
export const requestedSpeed = createAction(
  '[Clock/API] Requested speed',
  props<{ speed: SpeedId }>(),
);
export const setSpeedSuccess = createAction(
  '[Clock/API] Set speed success',
  props<{ speed: SpeedId }>(),
);
export const clockCommandFailure = createAction(
  '[Clock/API] Clock command failure',
  props<{ error: unknown }>(),
);
export const jumpToSuccess = createAction(
  '[Clock/API] Jump to success',
  props<{ targetTick: Tick }>(),
);
export const jumpToFailure = createAction(
  '[Clock/API] Jump to failure',
  props<{ error: unknown }>(),
);
export const retrievedExchanges = createAction(
  '[Clock/API] Retrieved exchanges',
  props<{ exchanges: ExchangeInfo[] }>(),
);
export const loadExchangesFailure = createAction(
  '[Clock/API] Load exchanges failure',
  props<{ error: unknown }>(),
);
export const setBackgroundModeFailure = createAction(
  '[Clock/API] Set background mode failure',
  props<{ error: unknown }>(),
);
