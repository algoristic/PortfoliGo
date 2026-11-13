import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { AccountEventCode } from '@app/banking/domain/models/household.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { DistributionKind } from '@app/portfolio/domain/models/distribution.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { OrderRejection, OrderSide } from '@app/trading/domain/models/order.model';

import { BackgroundMode } from './game-state.model';

/**
 * Events of the engine: codes with parameters, never texts (TS §8.6). They never contain prices
 * after their tick (TS §4.5, rule 7). Series are indices as in `market/domain/series.ts`.
 */
export type EngineEvent =
  | {
      type: 'dividend-announced';
      tick: Tick;
      series: number;
      cents: Cents;
      exDay: number;
    }
  | { type: 'session-opened'; tick: Tick; exchangeId: string }
  | { type: 'ex-dividend'; tick: Tick; series: number; cents: Cents; paymentDay: number }
  | {
      type: 'session-closed';
      tick: Tick;
      exchangeId: string;
      /** Trading day that ended; its daily candles of `series` are final now (TS §6.8). */
      day: number;
      series: readonly number[];
    }
  | { type: 'month-ended'; tick: Tick; year: number; month: number }
  | { type: 'year-ended'; tick: Tick; year: number }
  | { type: 'background-mode-changed'; tick: Tick; mode: BackgroundMode }
  | {
      /** A balance or limit change uncovered the account or exceeded its limit (TS §7.4). */
      type: AccountEventCode;
      tick: Tick;
      accountId: AccountId;
      balance: Cents;
      /** Overdraft limit; `null` for accounts without overdraft facility. */
      limit: Cents | null;
    }
  | {
      /** Credit interest was booked; `tax` is the tax booked right after it (refunds negative). */
      type: 'interest-credited';
      tick: Tick;
      accountId: AccountId;
      amount: Cents;
      tax: Cents;
    }
  | {
      /**
       * A dividend or fund distribution was credited on its payment date (TS §6.5, §7.4); `tax` is
       * the tax booked right after it (refunds negative).
       */
      type: 'distribution-paid';
      tick: Tick;
      kind: DistributionKind;
      accountId: AccountId;
      depotId: DepotId;
      instrumentId: string;
      quantity: MicroUnits;
      amount: Cents;
      tax: Cents;
    }
  | OrderEvent;

/** What every order event says about its order (TS §7.5). */
interface OrderEventBase {
  tick: Tick;
  orderId: string;
  depotId: DepotId;
  instrumentId: string;
  side: OrderSide;
}

/**
 * Events of the order system (TS §7.5, §12): a stop was reached (the order executes in the same
 * tick or waits for its limit), an execution with its shares, price and debit or credit, a
 * rejection at execution and the end of the validity. Cancellations answer a command and have no
 * event.
 */
export type OrderEvent =
  | (OrderEventBase & { type: 'order-triggered' })
  | (OrderEventBase & {
      type: 'order-executed';
      quantity: MicroUnits;
      /** Execution price in euros (ask for purchases, bid for sales). */
      price: number;
      /** Debit of a purchase or credit of a sale, costs included (TS §7.5). */
      total: Cents;
      /**
       * Tax booked right after a sale on its realized gain (TS §7.7), a refund negative; 0 for
       * purchases. The credit after costs and taxes is `total − tax` (US-HD-02).
       */
      tax: Cents;
    })
  | (OrderEventBase & { type: 'order-rejected'; reason: OrderRejection })
  | (OrderEventBase & { type: 'order-expired' });

export type EngineEventType = EngineEvent['type'];
