import { getRouterSelectors } from '@ngrx/router-store';
import { createSelector } from '@ngrx/store';

import { navPathFromUrl } from './shell.utils';

const { selectUrl } = getRouterSelectors();

export const selectActiveNavPath = createSelector(selectUrl, (url) => navPathFromUrl(url));
