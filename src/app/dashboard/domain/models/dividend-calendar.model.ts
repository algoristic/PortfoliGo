import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

/**
 * A date of the dividend calendar (US-MK-06, TS §8.1): an announced ex-date of a held or watched
 * instrument with its payment date, or a payout earned at a past ex-date and still to be credited.
 * Only announced amounts; nothing the market has not told yet.
 */
export interface DividendCalendarEntry {
  instrumentId: string;
  exTick: Tick;
  paymentTick: Tick;
  /** Dividend or distribution per share. */
  perShare: Cents;
  /** Shares of all open depots at the ex-date (earned) or now (announced); `null` if not held. */
  quantity: MicroUnits | null;
  /** Gross amount the holding gets; `null` if not held. */
  expected: Cents | null;
  /** The ex-date has passed; only the payment is still to come. */
  earned: boolean;
}
