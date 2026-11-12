import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { PlayersEffects } from './players.effects';
import { PlayersFacade } from './players.facade';
import * as fromPlayers from './players.reducer';

import { providePlayersService } from '../../data-access/service/players-service.providers';

/** App-wide (TS §11.3): the player selection and, from AP 2.5, the game area read it. */
export function providePlayersState(): Array<Provider | EnvironmentProviders> {
  return [
    PlayersFacade,
    provideState(fromPlayers.PLAYERS_FEATURE_KEY, fromPlayers.playersReducer),
    provideEffects(PlayersEffects),
    providePlayersService(),
  ];
}
