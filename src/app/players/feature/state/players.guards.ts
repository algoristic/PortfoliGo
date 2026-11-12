import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { PlayersFacade } from './players.facade';

export function enterPlayersPage(): CanActivateFn {
  return () => {
    inject(PlayersFacade).enterPlayersPage();
    return true;
  };
}

export function leavePlayersPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(PlayersFacade).leavePlayersPage();
    return true;
  };
}

export function enterNewPlayerPage(): CanActivateFn {
  return () => {
    inject(PlayersFacade).enterNewPlayerPage();
    return true;
  };
}
