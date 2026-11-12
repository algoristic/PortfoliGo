import { PlayerListEntry, PlayerProfile } from '@app/players/domain/models/player.model';

import * as PlayersActions from './players.actions';
import { initialPlayersState, playersReducer, PlayersState } from './players.reducer';

function entry(id: string, name: string): PlayerListEntry {
  return { id, name, seed: 's', tick: null, lastSeenAt: null, createdAt: 0, outdated: false };
}

const LOADED: PlayersState = {
  ...initialPlayersState,
  loaded: true,
  players: [entry('p-a', 'Anna'), entry('p-b', 'Ben'), entry('p-c', 'Cleo')],
  lastPlayerId: 'p-b',
};

describe('playersReducer', () => {
  describe('renamePlayerSuccess', () => {
    it('renames the player in place and keeps the order of the last use', () => {
      const profile = { id: 'p-b', name: 'Zoe' } as PlayerProfile;
      const state = playersReducer(LOADED, PlayersActions.renamePlayerSuccess({ profile }));
      expect(state.players.map(({ id, name }) => `${id}:${name}`)).toEqual([
        'p-a:Anna',
        'p-b:Zoe',
        'p-c:Cleo',
      ]);
    });
  });

  describe('deletePlayerSuccess', () => {
    it('removes the player and forgets it as the last used one', () => {
      const state = playersReducer(
        LOADED,
        PlayersActions.deletePlayerSuccess({ playerId: 'p-b', name: 'Ben' }),
      );
      expect(state.players.map(({ id }) => id)).toEqual(['p-a', 'p-c']);
      expect(state.lastPlayerId).toBeUndefined();
    });

    it('keeps the last used player when another one is deleted', () => {
      const state = playersReducer(
        LOADED,
        PlayersActions.deletePlayerSuccess({ playerId: 'p-c', name: 'Cleo' }),
      );
      expect(state.players.map(({ id }) => id)).toEqual(['p-a', 'p-b']);
      expect(state.lastPlayerId).toBe('p-b');
    });
  });
});
