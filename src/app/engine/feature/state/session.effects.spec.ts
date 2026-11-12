import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, NEVER, of, Subject, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as SessionActions from './session.actions';
import { SessionEffects } from './session.effects';

import { EngineCommandError, EngineService } from '../../data-access/service/engine.service';

const PROFILE: PlayerProfile = {
  id: 'p-a',
  name: 'Anna',
  seed: 'kupfer-falke-731',
  seedKey: [1, 2, 3, 4],
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
  simVersion: 1,
  createdAt: 0,
};

describe('SessionEffects', () => {
  let effects: SessionEffects;
  let actions$: Subject<Action>;
  let engine: Mocked<
    Pick<EngineService, 'loadPlayer' | 'setVisibility' | 'progress$' | 'warning$' | 'fatal$'>
  >;
  let router: Mocked<Pick<Router, 'navigate'>>;
  let toasts: Mocked<Pick<ToastService, 'warning' | 'error'>>;

  beforeEach(() => {
    localStorage.clear();
    actions$ = new Subject();
    engine = {
      loadPlayer: vi.fn(),
      setVisibility: vi.fn(() => of(null)),
      progress$: NEVER,
      warning$: NEVER,
      fatal$: NEVER,
    };
    router = { navigate: vi.fn(() => Promise.resolve(true)) };
    toasts = { warning: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        SessionEffects,
        LocalStorageService,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: EngineService, useValue: engine },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toasts },
      ],
    });
    effects = TestBed.inject(SessionEffects);
  });

  describe('loadPlayer$', () => {
    it('loads the player from the profile with the saved tick as the lower bound', async () => {
      localStorage.setItem('pgo.lastTick', JSON.stringify({ v: 1, data: { 'p-a': 5_389_950 } }));
      engine.loadPlayer.mockReturnValue(of({ playerId: 'p-a', tick: 5_389_950 }));
      const result = firstValueFrom(effects.loadPlayer$);
      actions$.next(SessionActions.enterGame({ profile: PROFILE }));
      expect(await result).toEqual(
        SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 5_389_950 } }),
      );
      expect(engine.loadPlayer).toHaveBeenCalledWith({
        playerId: 'p-a',
        seed: 'kupfer-falke-731',
        start: PROFILE.start,
        minTick: 5_389_950,
      });
    });

    it.each([
      ['no entry', null],
      ['another version', JSON.stringify({ v: 2, data: { 'p-a': 5_389_950 } })],
      ['another player', JSON.stringify({ v: 1, data: { 'p-b': 5_389_950 } })],
      ['broken JSON', '{"v":1,'],
    ])('loads without a lower bound when localStorage has %s', async (_case, stored) => {
      if (stored !== null) {
        localStorage.setItem('pgo.lastTick', stored);
      }
      engine.loadPlayer.mockReturnValue(of({ playerId: 'p-a', tick: 0 }));
      const result = firstValueFrom(effects.loadPlayer$);
      actions$.next(SessionActions.enterGame({ profile: PROFILE }));
      await result;
      expect(engine.loadPlayer.mock.calls[0][0].minTick).toBeUndefined();
    });

    it('dispatches loadPlayerFailure with the error of the engine', async () => {
      const error = new EngineCommandError('player-locked');
      engine.loadPlayer.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadPlayer$);
      actions$.next(SessionActions.enterGame({ profile: PROFILE }));
      expect(await result).toEqual(SessionActions.loadPlayerFailure({ error }));
    });
  });

  describe('leaveOutdated$', () => {
    it('sends an outdated player back to the selection, but not a locked one', () => {
      const subscription = effects.leaveOutdated$.subscribe();
      actions$.next(
        SessionActions.loadPlayerFailure({ error: new EngineCommandError('player-locked') }),
      );
      expect(router.navigate).not.toHaveBeenCalled();
      actions$.next(
        SessionActions.loadPlayerFailure({ error: new EngineCommandError('player-outdated') }),
      );
      subscription.unsubscribe();
      expect(router.navigate).toHaveBeenCalledWith(['/players']);
      expect(toasts.warning).toHaveBeenCalledTimes(1);
    });
  });
});
