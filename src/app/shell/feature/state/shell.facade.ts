import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as ShellSelectors from './shell.selectors';

@Injectable()
export class ShellFacade {
  readonly #store = inject(Store);

  activeNavPath$ = this.#store.pipe(select(ShellSelectors.selectActiveNavPath));
}
