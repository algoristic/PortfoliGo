import { Cents } from '@app/shared/domain/models/money.model';

/** Values of the transfer form (US-BK-04): account IDs as the selects hold them, `''` for none. */
export interface TransferFormModel {
  fromAccountId: string;
  toAccountId: string;
  amount: Cents | null;
  purpose: string;
}
