import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  concat,
  exhaustMap,
  filter,
  fromEvent,
  ignoreElements,
  last,
  map,
  mergeMap,
  Observable,
  of,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';

import { clockCommand, clockShortcut } from '@app/clock/domain/clock-control-logic';
import {
  ClockCommand,
  ClockIntent,
  ClockShortcut,
} from '@app/clock/domain/models/clock-control.model';
import { TradingHours } from '@app/clock/domain/models/time.model';
import { ClockPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import * as SessionSelectors from '@app/engine/feature/state/session.selectors';
import { isEngineCommandError } from '@app/engine/feature/state/session.utils';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as ClockActions from './clock.actions';

import { CLOCK_SHORTCUTS_ENABLED } from './clock.config';
import * as ClockSelectors from './clock.selectors';
import { focusedElement } from './clock.utils';

import { DialogJumpComponent } from '../dialog-jump/dialog-jump.component';
import { JumpDialogData, JumpDialogResult } from '../dialog-jump/dialog-jump.model';

@Injectable()
export class ClockEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #engine = inject(EngineService);
  readonly #document = inject(DOCUMENT);
  readonly #shortcutsEnabled$ = inject(CLOCK_SHORTCUTS_ENABLED);
  readonly #toastService = inject(ToastService);
  readonly #dialog = inject(Dialog);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /**
   * The engine sends the first clock event of a player right before its reply to `loadPlayer`;
   * events before that may still belong to the previous player. So the slice takes the last event
   * before the reply and every event after it.
   */
  watchClock$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const lastBeforeLoad$ = this.#engine.clock$.pipe(
          takeUntil(loaded$),
          last(undefined, null),
          filter((clock): clock is ClockPayload => clock !== null),
        );
        return concat(lastBeforeLoad$, this.#engine.clock$).pipe(
          map((clock) => ClockActions.receivedClock({ clock })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );

  controlClock$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        ClockActions.clickedTogglePause,
        ClockActions.clickedPause,
        ClockActions.clickedResume,
        ClockActions.selectedSpeed,
        ClockActions.clickedFaster,
        ClockActions.clickedSlower,
        ClockActions.pressedClockShortcut,
      ),
      concatLatestFrom(() => this.#store.pipe(select(ClockSelectors.selectControlState))),
      map(([action, control]) => clockCommand(intentOf(action), control)),
      filter((command): command is ClockCommand => command !== null),
      mergeMap((command) =>
        (command.type === 'setSpeed'
          ? concat(
              of(ClockActions.requestedSpeed({ speed: command.speed })),
              this.#send(command).pipe(
                map(() => ClockActions.setSpeedSuccess({ speed: command.speed })),
              ),
            )
          : this.#send(command).pipe(ignoreElements())
        ).pipe(catchError((error: unknown) => of(ClockActions.clockCommandFailure({ error })))),
      ),
    ),
  );

  jumpTo$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(ClockActions.submittedJump),
      exhaustMap(({ target }) =>
        this.#engine.jumpTo(target).pipe(
          map(({ targetTick }) => ClockActions.jumpToSuccess({ targetTick })),
          catchError((error: unknown) => of(ClockActions.jumpToFailure({ error }))),
        ),
      ),
    ),
  );

  /** The exchanges of the world for the market status (TS §3.3); queries pass while catching up. */
  loadExchanges$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.loadPlayerSuccess),
      switchMap(() =>
        this.#engine.query({ kind: 'exchanges' }).pipe(
          map(({ exchanges }) => ClockActions.retrievedExchanges({ exchanges })),
          catchError((error: unknown) => of(ClockActions.loadExchangesFailure({ error }))),
          takeUntil(this.#ended$),
        ),
      ),
    ),
  );

  /** The jump dialog computes its targets from the game time when it opens (TS §3.7). */
  openJumpDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(ClockActions.clickedJump),
      concatLatestFrom(() => [
        this.#store.pipe(select(ClockSelectors.selectClock)),
        this.#store.pipe(select(ClockSelectors.selectJumpSessions)),
      ]),
      map(([, clock, sessions]) => (clock === null || clock.jumping ? null : { clock, sessions })),
      filter((open): open is { clock: ClockPayload; sessions: TradingHours[] } => open !== null),
      exhaustMap(({ clock, sessions }) =>
        this.#dialog
          .open<JumpDialogResult, JumpDialogData>(DialogJumpComponent, {
            data: { now: clock.tick, sessions },
            ariaLabel: $localize`:@@featureClock-clockEffects-jumpDialogLabel:Vorspulen`,
            width: '28rem',
            maxWidth: 'calc(100vw - 2rem)',
            maxHeight: 'calc(100dvh - 2rem)',
          })
          .closed.pipe(
            filter((target): target is JumpTarget => target !== undefined),
            map((target) => ClockActions.submittedJump({ target })),
          ),
      ),
    ),
  );

  cancelJump$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(ClockActions.clickedCancelJump),
      mergeMap(() =>
        this.#engine.cancelJump().pipe(
          ignoreElements(),
          catchError((error: unknown) => of(ClockActions.clockCommandFailure({ error }))),
        ),
      ),
    ),
  );

  /**
   * Shortcuts of PS US-ZT-02 (TS §11.10) while the game is ready: not while loading, catching up or
   * jumping, not when switched off in the settings and not while a control has the focus.
   */
  shortcuts$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.loadPlayerSuccess),
      switchMap(() =>
        fromEvent<KeyboardEvent>(this.#document, 'keydown').pipe(takeUntil(this.#ended$)),
      ),
      filter((event) => !event.defaultPrevented),
      concatLatestFrom(() => [
        this.#shortcutsEnabled$,
        this.#store.pipe(select(SessionSelectors.selectStatus)),
        this.#store.pipe(select(ClockSelectors.selectJumping)),
      ]),
      filter(([, enabled, status, jumping]) => enabled && status === 'ready' && !jumping),
      map(([event]) => ({
        event,
        shortcut: clockShortcut(event, focusedElement(this.#document.activeElement)),
      })),
      filter(
        (pressed): pressed is { event: KeyboardEvent; shortcut: ClockShortcut } =>
          pressed.shortcut !== null,
      ),
      // Space would scroll the page otherwise.
      tap(({ event }) => event.preventDefault()),
      map(({ shortcut }) => ClockActions.pressedClockShortcut({ shortcut })),
    ),
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(ClockActions.clockCommandFailure, ClockActions.jumpToFailure),
        tap(({ error }) => this.#toastService.error(failureMessage(error))),
      ),
    { dispatch: false },
  );

  #send(command: ClockCommand): Observable<null> {
    switch (command.type) {
      case 'pause':
        return this.#engine.pause();
      case 'resume':
        return this.#engine.resume();
      case 'setSpeed':
        return this.#engine.setSpeed(command.speed);
    }
  }
}

type ClockControlAction = ReturnType<
  | typeof ClockActions.clickedTogglePause
  | typeof ClockActions.clickedPause
  | typeof ClockActions.clickedResume
  | typeof ClockActions.selectedSpeed
  | typeof ClockActions.clickedFaster
  | typeof ClockActions.clickedSlower
  | typeof ClockActions.pressedClockShortcut
>;

function intentOf(action: ClockControlAction): ClockIntent {
  switch (action.type) {
    case ClockActions.pressedClockShortcut.type:
      return action.shortcut;
    case ClockActions.selectedSpeed.type:
      return { speed: action.speed };
    case ClockActions.clickedPause.type:
      return 'pause';
    case ClockActions.clickedResume.type:
      return 'resume';
    case ClockActions.clickedFaster.type:
      return 'faster';
    case ClockActions.clickedSlower.type:
      return 'slower';
    case ClockActions.clickedTogglePause.type:
      return 'toggle-pause';
  }
}

function failureMessage(error: unknown): string {
  if (isEngineCommandError(error, 'busy')) {
    return $localize`:@@featureClock-clockEffects-busy:Das geht gerade nicht, weil die Spielzeit noch berechnet wird.`;
  }
  if (isEngineCommandError(error, 'invalid-jump-target')) {
    return $localize`:@@featureClock-clockEffects-invalidJumpTarget:Zu diesem Zeitpunkt kann nicht vorgespult werden.`;
  }
  return $localize`:@@featureClock-clockEffects-commandFailure:Die Spielzeit konnte nicht gesteuert werden.`;
}
