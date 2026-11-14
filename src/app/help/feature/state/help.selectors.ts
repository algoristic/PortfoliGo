import { getRouterSelectors } from '@ngrx/router-store';

const { selectFragment } = getRouterSelectors();

/** The term the URL points at (`…/help#spread`). */
export const selectGlossaryTermId = selectFragment;
