import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as SessionActions from './session.actions';
import { GameRejection } from './session.model';
import * as SessionSelectors from './session.selectors';

@Injectable()
export class SessionFacade {
  readonly #store = inject(Store);

  playerId$ = this.#store.pipe(select(SessionSelectors.selectPlayerId));
  playerName$ = this.#store.pipe(select(SessionSelectors.selectPlayerName));
  playerSeed$ = this.#store.pipe(select(SessionSelectors.selectPlayerSeed));
  status$ = this.#store.pipe(select(SessionSelectors.selectStatus));
  catchUpRatio$ = this.#store.pipe(select(SessionSelectors.selectCatchUpRatio));
  jumpRatio$ = this.#store.pipe(select(SessionSelectors.selectJumpRatio));
  candlesRatio$ = this.#store.pipe(select(SessionSelectors.selectCandlesRatio));
  warning$ = this.#store.pipe(select(SessionSelectors.selectWarning));

  enterGame(profile: PlayerProfile): void {
    this.#store.dispatch(SessionActions.enterGame({ profile }));
  }

  rejectGame(playerId: string, reason: GameRejection): void {
    this.#store.dispatch(SessionActions.rejectedGame({ playerId, reason }));
  }

  leaveGame(): void {
    this.#store.dispatch(SessionActions.leaveGame());
  }
}
