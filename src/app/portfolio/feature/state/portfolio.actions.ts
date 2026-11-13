import { createAction, props } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import { IndexComposition } from '@app/market/domain/models/instrument-figures.model';
import { PositionSortKey } from '@app/portfolio/domain/models/portfolio.model';

export const enterPortfolioPage = createAction('[Portfolio/Page] Enter portfolio page');
export const leavePortfolioPage = createAction('[Portfolio/Page] Leave portfolio page');

/** Shows one depot, or all of them combined with `null` (US-PF-02). */
export const selectedDepot = createAction(
  '[Portfolio/Page] Selected depot',
  props<{ depotId: DepotId | null }>(),
);
export const selectedPositionSort = createAction(
  '[Portfolio/Page] Selected position sort',
  props<{ key: PositionSortKey }>(),
);
/** Opens „Konto eröffnen“ with the kind „Depot“ from the empty state. */
export const clickedOpenDepot = createAction('[Portfolio/Page] Clicked open depot');

/** Compositions of held ETFs that are missing for the market day `day` (look-through, E-28). */
export const requestedCompositions = createAction(
  '[Portfolio/Page] Requested compositions',
  props<{ day: number; ids: string[] }>(),
);
export const retrievedComposition = createAction(
  '[Portfolio/API] Retrieved composition',
  props<{ day: number; instrumentId: string; composition: IndexComposition | null }>(),
);
export const loadCompositionFailure = createAction(
  '[Portfolio/API] Load composition failure',
  props<{ day: number; instrumentId: string; error: unknown }>(),
);
