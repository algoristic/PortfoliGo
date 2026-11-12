import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { NewPlayer } from '@app/players/domain/models/player.model';

import * as PlayersActions from './players.actions';
import * as PlayersSelectors from './players.selectors';

@Injectable()
export class PlayersFacade {
  readonly #store = inject(Store);

  players$ = this.#store.pipe(select(PlayersSelectors.selectPlayers));
  loaded$ = this.#store.pipe(select(PlayersSelectors.selectLoaded));
  lastPlayerId$ = this.#store.pipe(select(PlayersSelectors.selectLastPlayerId));
  suggestedSeed$ = this.#store.pipe(select(PlayersSelectors.selectSuggestedSeed));
  creating$ = this.#store.pipe(select(PlayersSelectors.selectCreating));

  enterPlayersPage(): void {
    this.#store.dispatch(PlayersActions.enterPlayersPage());
  }

  leavePlayersPage(): void {
    this.#store.dispatch(PlayersActions.leavePlayersPage());
  }

  enterNewPlayerPage(): void {
    this.#store.dispatch(PlayersActions.enterNewPlayerPage());
  }

  openPlayer(playerId: string): void {
    this.#store.dispatch(PlayersActions.clickedOpenPlayer({ playerId }));
  }

  renamePlayer(playerId: string): void {
    this.#store.dispatch(PlayersActions.clickedRenamePlayer({ playerId }));
  }

  deletePlayer(playerId: string): void {
    this.#store.dispatch(PlayersActions.clickedDeletePlayer({ playerId }));
  }

  suggestSeed(): void {
    this.#store.dispatch(PlayersActions.clickedSuggestSeed());
  }

  createPlayer(newPlayer: NewPlayer): void {
    this.#store.dispatch(PlayersActions.submittedNewPlayer({ newPlayer }));
  }
}
