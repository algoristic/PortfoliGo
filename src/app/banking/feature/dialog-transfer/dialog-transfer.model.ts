import { AccountId } from '@app/banking/domain/models/account.model';
import { TransferPayload } from '@app/engine/data-access/service/engine-service.model';

import { AccountEntry } from '../state/banking.model';

export interface TransferDialogData {
  /** The open accounts in display order, with their available amounts when the dialog opened. */
  accounts: AccountEntry[];
  /** The preselected source. */
  fromAccountId: AccountId;
}

/** The transfer to send; `undefined` when the dialog was closed without transferring. */
export type TransferDialogResult = TransferPayload;
