import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, RedirectCommand, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { PlayersService } from '@app/players/data-access/service/players.service';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { isOutdated } from '@app/players/domain/player-logic';

import { SessionFacade } from './session.facade';
import { GameRejection } from './session.model';

/**
 * Opens the game of `:playerId` (TS §11.4): a missing or outdated player goes back to the player
 * selection; otherwise `enterGame` loads the player in the engine. Outdated stored games, which only
 * the engine can tell (`schemaVersion` of the snapshot), are sent back by an effect.
 */
export function enterGame(): CanActivateFn {
  return (route) => {
    const facade = inject(SessionFacade);
    const router = inject(Router);
    const playerId = route.paramMap.get('playerId') ?? '';
    return inject(PlayersService)
      .getProfile(playerId)
      .pipe(
        map((profile): PlayerProfile | GameRejection => {
          if (profile === undefined) {
            return 'not-found';
          }
          return isOutdated(profile, undefined) ? 'outdated' : profile;
        }),
        catchError(() => of<GameRejection>('unavailable')),
        map((result) => {
          if (typeof result === 'string') {
            facade.rejectGame(playerId, result);
            return new RedirectCommand(router.parseUrl('/players'));
          }
          facade.enterGame(result);
          return true;
        }),
      );
  };
}

export function leaveGame(): CanDeactivateFn<unknown> {
  return () => {
    inject(SessionFacade).leaveGame();
    return true;
  };
}
