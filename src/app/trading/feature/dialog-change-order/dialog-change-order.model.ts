import { OrderChange } from '@app/trading/domain/models/order.model';

export interface ChangeOrderDialogData {
  orderId: string;
}

/** The changed fields; `undefined` when the dialog was closed without a change. */
export type ChangeOrderDialogResult = OrderChange;
