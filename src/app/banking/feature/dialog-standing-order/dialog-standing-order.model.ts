import { StandingOrderSpec } from '@app/banking/domain/models/standing-order.model';
import { StandingOrderFormModel } from '@app/banking/ui/models/standing-order-form.model';

import { AccountEntry } from '../state/banking.model';

export interface StandingOrderDialogData {
  /** The open accounts in display order. */
  accounts: AccountEntry[];
  /** `create` for „Dauerauftrag anlegen“, `change` for „Dauerauftrag ändern“. */
  mode: 'create' | 'change';
  /** The preselected values: from the context when creating, the order's values when changing. */
  initial: StandingOrderFormModel;
}

/** The standing order to send; `undefined` when the dialog was closed without saving. */
export type StandingOrderDialogResult = StandingOrderSpec;
