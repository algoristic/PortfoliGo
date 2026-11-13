import { AccountId } from '@app/banking/domain/models/account.model';

import { AccountEntry } from '../state/banking.model';

export interface SalaryAccountDialogData {
  /** The open current accounts in display order. */
  accounts: AccountEntry[];
  /** The preselected account. */
  accountId: AccountId;
}

/** The new salary account; `undefined` when the dialog was closed without changing it. */
export type SalaryAccountDialogResult = AccountId;

export interface SalaryAccountFormModel {
  accountId: string;
}
