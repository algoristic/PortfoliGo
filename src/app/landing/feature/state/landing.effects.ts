import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';

import * as LandingActions from './landing.actions';
import { tap } from 'rxjs';

@Injectable()
export class LandingEffects {
  private readonly actions$ = inject(Actions);
  private readonly router = inject(Router);

  // TODO richtiges logout des aktiven nutzers hier... (localStorage löschen etc.)
  logout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LandingActions.requestedLogout),
        tap(() => this.router.navigate(['user/select'])),
      ),
    { dispatch: false },
  );
}
