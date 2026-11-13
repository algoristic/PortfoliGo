import { Action, createReducer, on } from '@ngrx/store';

import { Tick } from '@app/clock/domain/models/time.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { TaxYear } from '@app/taxes/domain/models/tax.model';

import * as TaxesActions from './taxes.actions';

export const TAXES_FEATURE_KEY = 'taxes';

/**
 * Tax state of the loaded player (TS §7.7, §11.3): the running year and the closed years, oldest
 * first, as the last projection carried them; `null` until the first one.
 */
export interface TaxesState {
  tick: Tick | null;
  current: TaxYear | null;
  closed: TaxYear[];
}

export const initialTaxesState: TaxesState = { tick: null, current: null, closed: [] };

const reducer = createReducer(
  initialTaxesState,
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialTaxesState),
  on(TaxesActions.receivedTaxes, (_state, { taxes }) => ({
    tick: taxes.tick,
    current: taxes.current,
    closed: taxes.closed,
  })),
);

export function taxesReducer(state: TaxesState | undefined, action: Action): TaxesState {
  return reducer(state, action);
}
