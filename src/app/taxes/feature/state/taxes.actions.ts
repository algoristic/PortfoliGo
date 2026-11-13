import { createAction, props } from '@ngrx/store';

import { TaxesProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';

/** The tax part of a projection (TS §8.3): running and closed tax years of the loaded player. */
export const receivedTaxes = createAction(
  '[Taxes/API] Received taxes',
  props<{ taxes: TaxesProjectionUpdate }>(),
);
