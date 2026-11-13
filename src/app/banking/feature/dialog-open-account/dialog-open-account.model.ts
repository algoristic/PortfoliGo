import { OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { Bank } from '@app/world/domain/models/bank.model';

export interface OpenAccountDialogData {
  banks: Bank[];
  /** The preselected bank. */
  bankId: string;
}

/** The bank and kind to open; `undefined` when the dialog was closed without opening. */
export interface OpenAccountDialogResult {
  bankId: string;
  kind: OpenableAccountKind;
}

/** Values of the controls: `''` while no kind is chosen. */
export interface OpenAccountFormModel {
  bankId: string;
  kind: OpenableAccountKind | '';
}
