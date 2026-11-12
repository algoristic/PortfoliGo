import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { SIM_VERSION } from '@app/engine/domain/version';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import { SessionFacade } from './session.facade';
import { enterGame } from './session.guards';

const PROFILE = { id: 'p-a', name: 'Anna', simVersion: SIM_VERSION } as PlayerProfile;

describe('enterGame', () => {
  let players: Mocked<Pick<PlayersService, 'getProfile'>>;
  let facade: Mocked<Pick<SessionFacade, 'enterGame' | 'rejectGame'>>;

  beforeEach(() => {
    players = { getProfile: vi.fn() };
    facade = { enterGame: vi.fn(), rejectGame: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayersService, useValue: players },
        { provide: SessionFacade, useValue: facade },
      ],
    });
  });

  async function run(): Promise<unknown> {
    const route = { paramMap: convertToParamMap({ playerId: 'p-a' }) } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() =>
      enterGame()(route, {} as RouterStateSnapshot),
    ) as Observable<unknown>;
    return firstValueFrom(result);
  }

  function isRedirectToPlayers(result: unknown): boolean {
    const router = TestBed.inject(Router);
    return (
      result instanceof RedirectCommand &&
      router.serializeUrl(result.redirectTo as ReturnType<Router['parseUrl']>) === '/players'
    );
  }

  it('enters the game of a stored player of this version', async () => {
    players.getProfile.mockReturnValue(of(PROFILE));
    expect(await run()).toBe(true);
    expect(players.getProfile).toHaveBeenCalledWith('p-a');
    expect(facade.enterGame).toHaveBeenCalledWith(PROFILE);
    expect(facade.rejectGame).not.toHaveBeenCalled();
  });

  it.each([
    ['not-found', of(undefined)],
    ['outdated', of({ ...PROFILE, simVersion: SIM_VERSION + 1 })],
    ['unavailable', throwError(() => new Error('database blocked'))],
  ] as const)('sends the player back to the selection when %s', async (reason, profile$) => {
    players.getProfile.mockReturnValue(profile$);
    expect(isRedirectToPlayers(await run())).toBe(true);
    expect(facade.rejectGame).toHaveBeenCalledWith('p-a', reason);
    expect(facade.enterGame).not.toHaveBeenCalled();
  });
});
