import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';

import { combineLatest, filter, map, switchMap } from 'rxjs';

import { UsersFacade } from './users.facade';

export function isAuthenticated(): CanActivateFn {
  return () => {
    const usersFacade = inject(UsersFacade);
    const router = inject(Router);
    return combineLatest([usersFacade.loadedUsers$, usersFacade.loadedActiveUser$]).pipe(
      filter(([loadedUsers, loadedActiveUser]) => !!loadedUsers && !!loadedActiveUser),
      switchMap(() =>
        usersFacade.activeUser$.pipe(
          map((activeUser) => {
            if (!!activeUser) {
              return true;
            }

            const redirectUrl = '/user/select';
            const redirectUrlTree = router.parseUrl(redirectUrl);
            return new RedirectCommand(redirectUrlTree);
          }),
        ),
      ),
    );
  };
}

export function isUserAvailable(): CanActivateFn {
  return () => {
    const usersFacade = inject(UsersFacade);
    const router = inject(Router);
    return usersFacade.loadedUsers$.pipe(
      filter((loaded) => !!loaded),
      switchMap(() =>
        usersFacade.users$.pipe(
          map((users) => {
            if (users.length > 0) {
              return true;
            }

            const redirectUrl = '/user/create';
            const redirectUrlTree = router.parseUrl(redirectUrl);
            return new RedirectCommand(redirectUrlTree);
          }),
        ),
      ),
    );
  };
}
