import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, NEVER, of, Subject, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { NewPlayer, PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PlayersActions from './players.actions';
import { PlayersEffects } from './players.effects';

import { PlayersServiceError } from '../../data-access/service/players-service.model';
import { PlayersService } from '../../data-access/service/players.service';

const NEW_PLAYER: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};
const PROFILE = { id: 'p-a', name: 'Anna' } as PlayerProfile;

describe('PlayersEffects', () => {
  let effects: PlayersEffects;
  let actions$: Subject<Action>;
  let service: Mocked<
    Pick<PlayersService, 'createPlayer' | 'requestPersistence' | 'setLastPlayerId'>
  >;
  let toasts: Mocked<Pick<ToastService, 'warning' | 'error' | 'success'>>;

  beforeEach(() => {
    actions$ = new Subject();
    service = {
      createPlayer: vi.fn(),
      requestPersistence: vi.fn(() => of(true)),
      setLastPlayerId: vi.fn(() => of(undefined)),
    };
    toasts = { warning: vi.fn(), error: vi.fn(), success: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PlayersEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: PlayersService, useValue: service },
        { provide: ToastService, useValue: toasts },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    effects = TestBed.inject(PlayersEffects);
  });

  describe('createPlayer$', () => {
    async function create(): Promise<Action[]> {
      const result = firstValueFrom(effects.createPlayer$.pipe(toArray()));
      actions$.next(PlayersActions.submittedNewPlayer({ newPlayer: NEW_PLAYER }));
      actions$.complete();
      return result;
    }

    it('remembers the created player', async () => {
      service.createPlayer.mockReturnValue(of({ profile: PROFILE, firstPlayer: false }));
      expect(await create()).toEqual([
        PlayersActions.createPlayerSuccess({ profile: PROFILE, firstPlayer: false }),
      ]);
      expect(service.setLastPlayerId).toHaveBeenCalledWith('p-a');
    });

    it('opens the created player even when it cannot be remembered', async () => {
      service.createPlayer.mockReturnValue(of({ profile: PROFILE, firstPlayer: true }));
      service.setLastPlayerId.mockReturnValue(throwError(() => new Error('quota')));
      expect(await create()).toEqual([
        PlayersActions.createPlayerSuccess({ profile: PROFILE, firstPlayer: true }),
      ]);
    });

    it('does not wait for the persistence request', async () => {
      service.createPlayer.mockReturnValue(of({ profile: PROFILE, firstPlayer: true }));
      service.requestPersistence.mockReturnValue(NEVER);
      expect(await create()).toEqual([
        PlayersActions.createPlayerSuccess({ profile: PROFILE, firstPlayer: true }),
      ]);
    });

    it('dispatches createPlayerFailure when the service errors', async () => {
      const error = new Error('write failed');
      service.createPlayer.mockReturnValue(throwError(() => error));
      expect(await create()).toEqual([PlayersActions.createPlayerFailure({ error })]);
    });
  });

  describe('requestPersistence$', () => {
    it('asks for persistent storage only after the first player', () => {
      effects.requestPersistence$.subscribe();
      actions$.next(PlayersActions.createPlayerSuccess({ profile: PROFILE, firstPlayer: false }));
      expect(service.requestPersistence).not.toHaveBeenCalled();
      actions$.next(PlayersActions.createPlayerSuccess({ profile: PROFILE, firstPlayer: true }));
      expect(service.requestPersistence).toHaveBeenCalledTimes(1);
    });
  });

  describe('showDeleteFailure$', () => {
    it('warns that a locked player is open in another tab', () => {
      effects.showDeleteFailure$.subscribe();
      actions$.next(
        PlayersActions.deletePlayerFailure({
          name: 'Anna',
          error: new PlayersServiceError('player-locked', 'p-a'),
        }),
      );
      expect(toasts.warning).toHaveBeenCalledWith(
        expect.stringContaining('„Anna“ ist in einem anderen Tab geöffnet'),
      );
      expect(toasts.error).not.toHaveBeenCalled();
    });

    it('reports other failures as errors', () => {
      effects.showDeleteFailure$.subscribe();
      actions$.next(PlayersActions.deletePlayerFailure({ name: 'Anna', error: new Error('io') }));
      expect(toasts.error).toHaveBeenCalledWith('„Anna“ konnte nicht gelöscht werden.');
      expect(toasts.warning).not.toHaveBeenCalled();
    });
  });
});
