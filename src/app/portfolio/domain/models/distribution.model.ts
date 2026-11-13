import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

/** Payouts to holders (TS §6.5, §7.2): dividends of shares, distributions of distributing ETFs. */
export const DISTRIBUTION_KINDS = ['dividend', 'fund-distribution'] as const;
export type DistributionKind = (typeof DISTRIBUTION_KINDS)[number];

/**
 * A payout a holding earned at the ex-date and that is credited on the payment date (TS §6.5,
 * §7.4): the shares held at the previous close times the amount per share.
 */
export interface PendingDistribution {
  kind: DistributionKind;
  depotId: DepotId;
  instrumentId: string;
  /**
   * Account the payout goes to: the depot's clearing account, or the target chosen when it closed
   * before the payment date.
   */
  accountId: AccountId;
  /** Shares at the ex-date. */
  quantity: MicroUnits;
  /** Dividend or distribution per share. */
  cents: Cents;
  /** Gross amount, `distributionAmount(quantity, cents)`. */
  amount: Cents;
  exTick: Tick;
  /** Tick of the credit: the payment date at 06:00 (`distributionPaymentTick`). */
  paymentTick: Tick;
}
