import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, take, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { ClockPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as ClockActions from './clock.actions';
import { ClockEffects } from './clock.effects';
import { CLOCK_FEATURE_KEY, initialClockState } from './clock.reducer';

function clockAt(tick: number, paused = false): ClockPayload {
  return {
    tick,
    speed: '1h',
    paused,
    visible: true,
    backgroundMode: 'realtime',
    effectiveSpeed: paused ? null : '1h',
    overloaded: false,
    jumping: false,
  };
}

describe('ClockEffects', () => {
  let effects: ClockEffects;
  let actions$: Subject<Action>;
  let clock$: Subject<ClockPayload>;
  let store: MockStore;
  let engine: Mocked<Pick<EngineService, 'pause' | 'resume' | 'setSpeed' | 'query' | 'clock$'>>;
  let toasts: Mocked<Pick<ToastService, 'error'>>;

  beforeEach(() => {
    actions$ = new Subject();
    clock$ = new Subject();
    engine = {
      pause: vi.fn(() => of(null)),
      resume: vi.fn(() => of(null)),
      setSpeed: vi.fn(() => of(null)),
      query: vi.fn(),
      clock$: clock$.asObservable(),
    };
    toasts = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ClockEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore({ initialState: { [CLOCK_FEATURE_KEY]: initialClockState } }),
        { provide: EngineService, useValue: engine },
        { provide: ToastService, useValue: toasts },
      ],
    });
    effects = TestBed.inject(ClockEffects);
    store = TestBed.inject(MockStore);
  });

  function setClock(clock: ClockPayload | null): void {
    store.setState({ [CLOCK_FEATURE_KEY]: { ...initialClockState, clock } });
  }

  describe('watchClock$', () => {
    it('takes the last clock event before the reply to loadPlayer and every one after it', async () => {
      const profile = { id: 'p-b' } as PlayerProfile;
      const result = firstValueFrom(effects.watchClock$.pipe(take(2), toArray()));
      actions$.next(SessionActions.enterGame({ profile }));
      clock$.next(clockAt(100));
      clock$.next(clockAt(5));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-b', tick: 5 } }));
      clock$.next(clockAt(6));
      expect(await result).toEqual([
        ClockActions.receivedClock({ clock: clockAt(5) }),
        ClockActions.receivedClock({ clock: clockAt(6) }),
      ]);
    });

    it('drops the clock events after the game was left', async () => {
      const received: Action[] = [];
      const subscription = effects.watchClock$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile: { id: 'p-a' } as PlayerProfile }));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } }));
      clock$.next(clockAt(1));
      actions$.next(SessionActions.leaveGame());
      clock$.next(clockAt(2));
      subscription.unsubscribe();
      expect(received).toEqual([ClockActions.receivedClock({ clock: clockAt(1) })]);
    });
  });

  describe('controlClock$', () => {
    it('pauses a running game and resumes a paused one with the space shortcut', () => {
      const subscription = effects.controlClock$.subscribe();
      setClock(clockAt(1, false));
      actions$.next(ClockActions.pressedClockShortcut({ shortcut: 'toggle-pause' }));
      setClock(clockAt(1, true));
      actions$.next(ClockActions.pressedClockShortcut({ shortcut: 'toggle-pause' }));
      subscription.unsubscribe();
      expect(engine.pause).toHaveBeenCalledTimes(1);
      expect(engine.resume).toHaveBeenCalledTimes(1);
    });

    it('sends the next speed and nothing before the first clock event or at the fastest', () => {
      const subscription = effects.controlClock$.subscribe();
      actions$.next(ClockActions.clickedFaster());
      setClock(clockAt(1));
      actions$.next(ClockActions.clickedFaster());
      setClock({ ...clockAt(1), speed: '1w' });
      actions$.next(ClockActions.clickedFaster());
      actions$.next(ClockActions.selectedSpeed({ speed: 'realtime' }));
      subscription.unsubscribe();
      expect(engine.setSpeed.mock.calls).toEqual([['2h'], ['realtime']]);
    });

    it('dispatches clockCommandFailure when the engine refuses', async () => {
      const error = new EngineCommandError('busy');
      engine.pause.mockReturnValue(throwError(() => error));
      setClock(clockAt(1));
      const result = firstValueFrom(effects.controlClock$);
      actions$.next(ClockActions.clickedPause());
      expect(await result).toEqual(ClockActions.clockCommandFailure({ error }));
    });
  });

  describe('loadExchanges$', () => {
    const loaded = SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } });

    it('loads the exchanges once the player is loaded', async () => {
      const exchanges = [
        { id: 'exc-de', name: 'DE', regionId: 'europe' as const, open: 540, close: 1_050 },
      ];
      engine.query.mockReturnValue(of({ kind: 'exchanges' as const, exchanges }));
      const result = firstValueFrom(effects.loadExchanges$);
      actions$.next(loaded);
      expect(await result).toEqual(ClockActions.retrievedExchanges({ exchanges }));
      expect(engine.query).toHaveBeenCalledWith({ kind: 'exchanges' });
    });

    it('dispatches loadExchangesFailure when the query fails', async () => {
      const error = new EngineCommandError('player-not-loaded');
      engine.query.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadExchanges$);
      actions$.next(loaded);
      expect(await result).toEqual(ClockActions.loadExchangesFailure({ error }));
    });
  });

  describe('showFailure$', () => {
    it.each([
      [
        new EngineCommandError('busy'),
        'Das geht gerade nicht, weil die Spielzeit noch berechnet wird.',
      ],
      [
        new EngineCommandError('invalid-jump-target'),
        'Zu diesem Zeitpunkt kann nicht vorgespult werden.',
      ],
      [new EngineCommandError('storage-failed'), 'Die Spielzeit konnte nicht gesteuert werden.'],
    ])('shows a toast for %s', (error, text) => {
      const subscription = effects.showFailure$.subscribe();
      actions$.next(ClockActions.clockCommandFailure({ error }));
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledWith(text);
    });
  });
});
