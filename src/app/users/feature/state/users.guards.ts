import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { UsersFacade } from './users.facade';
import { filter, map, switchMap } from 'rxjs';

export function isAuthenticated(): CanActivateFn {
  return () => {
    const usersFacade = inject(UsersFacade);
    const router = inject(Router);
    return usersFacade.loaded$.pipe(
      filter((loaded) => !!loaded),
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
    return usersFacade.loaded$.pipe(
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
