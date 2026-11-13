import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { OrderValidityKind } from '@app/trading/domain/models/order.model';

/**
 * Live state of the dialog „Order ändern“ (US-HD-04): the order as the engine projects it and what
 * the engine's check of a change needs (`orderChangeError`).
 */
export interface ChangeOrderContext {
  order: OrderView;
  instrumentName: string;
  tick: Tick;
  /** Conditions of the depot's bank; `null` while the banks are not loaded. */
  conditions: DepotConditions | null;
  clearingBalance: Cents;
  /** Reservations of the depot's active buy orders, this order's included. */
  reserved: Cents;
  /** Ask at the depot's bank (with its mark-up); `null` until the quote arrives. */
  ask: number | null;
}

/** Values of the controls of a change; price fields hold the text as typed. */
export interface ChangeOrderModel {
  limit: string;
  stop: string;
  validity: OrderValidityKind;
  /** Value of the date input (`2030-05-15`) for the validity `date`. */
  validityDate: string;
}
