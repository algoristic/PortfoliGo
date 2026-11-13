import { AccountId } from '@app/banking/domain/models/account.model';
import { ClosingPreview } from '@app/banking/domain/models/bank-command.model';

import { AccountEntry } from '../state/banking.model';

export interface CloseAccountDialogData {
  account: AccountEntry;
  /** The settlement if the account closed now (TS §7.4, PS §10.1). */
  preview: ClosingPreview;
  /** Accounts the remainder can go to: open, not this one. */
  targets: AccountEntry[];
}

/** `targetAccountId` receives the remainder; `undefined` when the dialog was closed without closing. */
export interface CloseAccountDialogResult {
  targetAccountId: AccountId | null;
}

export interface CloseAccountFormModel {
  targetAccountId: string;
}
