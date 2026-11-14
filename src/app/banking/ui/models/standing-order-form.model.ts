import { Cents } from '@app/shared/domain/models/money.model';

/**
 * Values of the standing order form (US-BK-10): account IDs and the day as the selects hold them,
 * `''` for none.
 */
export interface StandingOrderFormModel {
  fromAccountId: string;
  toAccountId: string;
  amount: Cents | null;
  day: string;
  purpose: string;
}
