import { DepotId } from '@app/banking/domain/models/account.model';
import { OrderSide, OrderSpec } from '@app/trading/domain/models/order.model';

export interface OrderTicketDialogData {
  instrumentId: string;
  side: OrderSide;
  /** The preselected open depot. */
  depotId: DepotId;
}

/** The order to place; `undefined` when the dialog was closed without ordering. */
export type OrderTicketDialogResult = OrderSpec;
