import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { SpeedId } from '@app/clock/domain/models/speed.model';
import { BackgroundMode } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';

import * as ClockActions from './clock.actions';
import { CLOCK_SHORTCUTS_ENABLED } from './clock.config';
import * as ClockSelectors from './clock.selectors';

@Injectable()
export class ClockFacade {
  readonly #store = inject(Store);

  clock$ = this.#store.pipe(select(ClockSelectors.selectClock));
  tick$ = this.#store.pipe(select(ClockSelectors.selectTick));
  speed$ = this.#store.pipe(select(ClockSelectors.selectSpeed));
  paused$ = this.#store.pipe(select(ClockSelectors.selectPaused));
  effectiveSpeed$ = this.#store.pipe(select(ClockSelectors.selectEffectiveSpeed));
  overloaded$ = this.#store.pipe(select(ClockSelectors.selectOverloaded));
  jumping$ = this.#store.pipe(select(ClockSelectors.selectJumping));
  jumpTargetTick$ = this.#store.pipe(select(ClockSelectors.selectJumpTargetTick));
  canFaster$ = this.#store.pipe(select(ClockSelectors.selectCanFaster));
  canSlower$ = this.#store.pipe(select(ClockSelectors.selectCanSlower));
  regionStatuses$ = this.#store.pipe(select(ClockSelectors.selectRegionStatuses));
  exchangeStatuses$ = this.#store.pipe(select(ClockSelectors.selectExchangeStatuses));
  backgroundMode$ = this.#store.pipe(select(ClockSelectors.selectBackgroundMode));
  shortcutsEnabled$ = inject(CLOCK_SHORTCUTS_ENABLED);

  togglePause(): void {
    this.#store.dispatch(ClockActions.clickedTogglePause());
  }

  pause(): void {
    this.#store.dispatch(ClockActions.clickedPause());
  }

  resume(): void {
    this.#store.dispatch(ClockActions.clickedResume());
  }

  setSpeed(speed: SpeedId): void {
    this.#store.dispatch(ClockActions.selectedSpeed({ speed }));
  }

  faster(): void {
    this.#store.dispatch(ClockActions.clickedFaster());
  }

  slower(): void {
    this.#store.dispatch(ClockActions.clickedSlower());
  }

  openJump(): void {
    this.#store.dispatch(ClockActions.clickedJump());
  }

  jumpTo(target: JumpTarget): void {
    this.#store.dispatch(ClockActions.submittedJump({ target }));
  }

  cancelJump(): void {
    this.#store.dispatch(ClockActions.clickedCancelJump());
  }

  setBackgroundMode(mode: BackgroundMode): void {
    this.#store.dispatch(ClockActions.selectedBackgroundMode({ mode }));
  }
}
