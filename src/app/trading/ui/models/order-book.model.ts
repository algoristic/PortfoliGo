import { DepotId } from '@app/banking/domain/models/account.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { Cents } from '@app/shared/domain/models/money.model';

/** An order of the order book (US-HD-04) with the names it is shown with. */
export interface OrderBookEntry {
  order: OrderView;
  /** The instrument's name; its ID while the master data is missing. */
  instrumentName: string;
  depotNumber: string;
  /** `null` while the banks are not loaded or the depot is unknown. */
  bankName: string | null;
}

/** Money of a clearing account reserved by active buy orders (US-HD-04). */
export interface DepotReservation {
  depotId: DepotId;
  depotNumber: string;
  bankName: string | null;
  reserved: Cents;
  /** Available amount of the clearing account after the reservations. */
  available: Cents;
}
