import { getRouterSelectors } from '@ngrx/router-store';
import { createSelector } from '@ngrx/store';

import { selectPlayerId } from '@app/engine/feature/state/session.selectors';

import { navPathFromUrl } from './shell.utils';

const { selectUrl } = getRouterSelectors();

export const selectActiveNavPath = createSelector(selectUrl, (url) => navPathFromUrl(url));
/** The glossary inside the game, the target of the context help (PS US-UI-06). */
export const selectGlossaryLink = createSelector(selectPlayerId, (playerId) =>
  playerId === null ? '/help' : `/game/${playerId}/help`,
);
