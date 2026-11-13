import { createAction, props } from '@ngrx/store';

import { MoversPayload } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Instrument } from '@app/market/domain/models/instrument.model';

export const enterMarketsPage = createAction('[Market/Page] Enter markets page');
export const leaveMarketsPage = createAction('[Market/Page] Leave markets page');
export const enterInstrumentPage = createAction('[Market/Page] Enter instrument page');
export const leaveInstrumentPage = createAction('[Market/Page] Leave instrument page');
/**
 * A view now watches the quotes of `series` under `key` (TS §8.4, §11.3); it replaces what the
 * key watched before.
 */
export const quotesSubscriptionChanged = createAction(
  '[Market/Page] Quotes subscription changed',
  props<{ key: string; series: readonly number[] }>(),
);
export const quotesSubscriptionEnded = createAction(
  '[Market/Page] Quotes subscription ended',
  props<{ key: string }>(),
);
export const moversSubscriptionStarted = createAction(
  '[Market/Page] Movers subscription started',
  props<{ key: string }>(),
);
export const moversSubscriptionEnded = createAction(
  '[Market/Page] Movers subscription ended',
  props<{ key: string }>(),
);

export const retrievedInstruments = createAction(
  '[Market/API] Retrieved instruments',
  props<{ instruments: Instrument[] }>(),
);
export const loadInstrumentsFailure = createAction(
  '[Market/API] Load instruments failure',
  props<{ error: unknown }>(),
);
/** The quotes of all subscriptions of one bundling window, the newest per series. */
export const receivedQuotes = createAction(
  '[Market/API] Received quotes',
  props<{ quotes: SeriesQuote[] }>(),
);
export const receivedMovers = createAction(
  '[Market/API] Received movers',
  props<{ movers: MoversPayload }>(),
);
