import { AccountId, AccountKind, DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

/** An account as the UI sees it in the `projection` event (TS §8.3). */
export interface AccountView {
  id: AccountId;
  kind: AccountKind;
  bankId: string;
  number: string;
  /** The depot of a clearing account. */
  depot: { id: DepotId; number: string } | null;
  openedAt: Tick;
  closedAt: Tick | null;
  balance: Cents;
  /** Overdraft limit of an open current account (0 without one); `null` for all other accounts. */
  overdraftLimit: Cents | null;
  /**
   * Balance plus free limit for own transfers (TS §7.4), for a clearing account minus the
   * reservations of active buy orders (TS §7.5); 0 for closed accounts.
   */
  available: Cents;
  salaryAccount: boolean;
}
