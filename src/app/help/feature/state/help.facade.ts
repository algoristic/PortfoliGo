import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as HelpSelectors from './help.selectors';

@Injectable()
export class HelpFacade {
  readonly #store = inject(Store);

  glossaryTermId$ = this.#store.pipe(select(HelpSelectors.selectGlossaryTermId));
}
