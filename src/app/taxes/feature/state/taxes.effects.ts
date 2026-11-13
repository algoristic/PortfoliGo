import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concat, filter, last, map, switchMap, take, takeUntil } from 'rxjs';

import { TaxesProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';

import * as TaxesActions from './taxes.actions';

@Injectable()
export class TaxesEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /**
   * Like the banking slice's `watchProjection$`: the tax part of the last full projection before
   * the reply to `loadPlayer` (earlier ones may belong to the previous player) and every one after
   * it, including the full one after a worker restart.
   */
  watchTaxes$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const fullBeforeLoad$ = this.#engine.taxes$.pipe(
          filter((taxes) => taxes.full),
          takeUntil(loaded$),
          last(undefined, null),
          filter((taxes): taxes is TaxesProjectionUpdate => taxes !== null),
        );
        return concat(fullBeforeLoad$, this.#engine.taxes$).pipe(
          map((taxes) => TaxesActions.receivedTaxes({ taxes })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );
}
