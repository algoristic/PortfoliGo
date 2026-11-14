import { createAction, props } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import {
  SavingsPlansProjectionUpdate,
  TradingProjectionUpdate,
} from '@app/engine/data-access/service/engine-service.model';
import { OrderChange, OrderSpec } from '@app/trading/domain/models/order.model';
import {
  SavingsPlanChange,
  SavingsPlanId,
  SavingsPlanSpec,
} from '@app/trading/domain/models/savings-plan.model';

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

/** All savings plans of a projection (TS §8.3); they replace what the slice had. */
export const receivedSavingsPlans = createAction(
  '[Trading/API] Received savings plans',
  props<{ savingsPlans: SavingsPlansProjectionUpdate }>(),
);

/**
 * Opens „Sparplan anlegen“ (US-HD-05): for the instrument when given (instrument page), else with
 * an instrument to choose; in `depotId` when given (depot page).
 */
export const clickedCreateSavingsPlan = createAction(
  '[Trading/Page] Clicked create savings plan',
  props<{ instrumentId?: string; depotId?: DepotId }>(),
);
export const clickedChangeSavingsPlan = createAction(
  '[Trading/Page] Clicked change savings plan',
  props<{ savingsPlanId: SavingsPlanId }>(),
);
/** Asks to confirm the deletion of a savings plan. */
export const clickedDeleteSavingsPlan = createAction(
  '[Trading/Page] Clicked delete savings plan',
  props<{ savingsPlanId: SavingsPlanId }>(),
);
/** The savings plan dialog chose another instrument: its quote is needed for the preview. */
export const selectedSavingsPlanInstrument = createAction(
  '[Trading/Page] Selected savings plan instrument',
  props<{ instrumentId: string }>(),
);

export const submittedCreateSavingsPlan = createAction(
  '[Trading/Page] Submitted create savings plan',
  props<{ plan: SavingsPlanSpec }>(),
);
export const createSavingsPlanSuccess = createAction(
  '[Trading/API] Create savings plan success',
  props<{ plan: SavingsPlanSpec; savingsPlanId: SavingsPlanId; tick: Tick }>(),
);
export const createSavingsPlanFailure = createAction(
  '[Trading/API] Create savings plan failure',
  props<{ error: unknown }>(),
);

export const submittedChangeSavingsPlan = createAction(
  '[Trading/Page] Submitted change savings plan',
  props<{ savingsPlanId: SavingsPlanId; change: SavingsPlanChange }>(),
);
export const changeSavingsPlanSuccess = createAction(
  '[Trading/API] Change savings plan success',
  props<{ savingsPlanId: SavingsPlanId; tick: Tick }>(),
);
export const changeSavingsPlanFailure = createAction(
  '[Trading/API] Change savings plan failure',
  props<{ error: unknown }>(),
);

export const submittedSetSavingsPlanPaused = createAction(
  '[Trading/Page] Submitted set savings plan paused',
  props<{ savingsPlanId: SavingsPlanId; paused: boolean }>(),
);
export const setSavingsPlanPausedSuccess = createAction(
  '[Trading/API] Set savings plan paused success',
  props<{ savingsPlanId: SavingsPlanId; paused: boolean; tick: Tick }>(),
);
export const setSavingsPlanPausedFailure = createAction(
  '[Trading/API] Set savings plan paused failure',
  props<{ error: unknown }>(),
);

export const submittedDeleteSavingsPlan = createAction(
  '[Trading/Page] Submitted delete savings plan',
  props<{ savingsPlanId: SavingsPlanId }>(),
);
export const deleteSavingsPlanSuccess = createAction(
  '[Trading/API] Delete savings plan success',
  props<{ savingsPlanId: SavingsPlanId; tick: Tick }>(),
);
export const deleteSavingsPlanFailure = createAction(
  '[Trading/API] Delete savings plan failure',
  props<{ error: unknown }>(),
);
