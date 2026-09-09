import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';

import * as LandingActions from './landing.actions';

@Injectable()
export class LandingFacade {
  readonly #store = inject(Store);

  logout(): void {
    this.#store.dispatch(LandingActions.requestedLogout());
  }
}
