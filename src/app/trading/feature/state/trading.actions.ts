import { createAction, props } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { TradingProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';
import { OrderChange, OrderSpec } from '@app/trading/domain/models/order.model';

/** Orders and holdings of a projection (TS §8.3, §8.4). */
export const receivedTrading = createAction(
  '[Trading/API] Received trading',
  props<{ trading: TradingProjectionUpdate }>(),
);

/** Opens the order ticket to buy the instrument, in `depotId` when given. */
export const clickedBuy = createAction(
  '[Trading/Page] Clicked buy',
  props<{ instrumentId: string; depotId?: DepotId }>(),
);
/** Opens the order ticket to sell the instrument, from `depotId` when given. */
export const clickedSell = createAction(
  '[Trading/Page] Clicked sell',
  props<{ instrumentId: string; depotId?: DepotId }>(),
);

export const submittedPlaceOrder = createAction(
  '[Trading/Page] Submitted place order',
  props<{ order: OrderSpec }>(),
);
export const placeOrderSuccess = createAction(
  '[Trading/API] Place order success',
  props<{ order: OrderSpec; orderId: string; tick: Tick }>(),
);
/** The order the engine refused, kept for the text of the toast (e.g. the shortfall). */
export const placeOrderFailure = createAction(
  '[Trading/API] Place order failure',
  props<{ order: OrderSpec; error: unknown }>(),
);

/** Opens the dialog „Order ändern“ for an active order (US-HD-04). */
export const clickedChangeOrder = createAction(
  '[Trading/Page] Clicked change order',
  props<{ orderId: string }>(),
);
/** Asks to confirm the cancellation of an active order (US-HD-04). */
export const clickedCancelOrder = createAction(
  '[Trading/Page] Clicked cancel order',
  props<{ orderId: string }>(),
);

export const submittedChangeOrder = createAction(
  '[Trading/Page] Submitted change order',
  props<{ orderId: string; change: OrderChange }>(),
);
export const changeOrderSuccess = createAction(
  '[Trading/API] Change order success',
  props<{ orderId: string; change: OrderChange; tick: Tick }>(),
);
export const changeOrderFailure = createAction(
  '[Trading/API] Change order failure',
  props<{ orderId: string; error: unknown }>(),
);

export const submittedCancelOrder = createAction(
  '[Trading/Page] Submitted cancel order',
  props<{ orderId: string }>(),
);
export const cancelOrderSuccess = createAction(
  '[Trading/API] Cancel order success',
  props<{ orderId: string; tick: Tick }>(),
);
export const cancelOrderFailure = createAction(
  '[Trading/API] Cancel order failure',
  props<{ orderId: string; error: unknown }>(),
);
