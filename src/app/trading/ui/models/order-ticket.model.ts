import { DepotId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { PositionView } from '@app/engine/domain/models/trading-view.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { TaxYear } from '@app/taxes/domain/models/tax.model';
import { OrderSide, OrderType, OrderValidityKind } from '@app/trading/domain/models/order.model';
import { ExchangeQuote } from '@app/trading/domain/order-preview-logic';

/** An open depot the order ticket offers, with what the preview needs (TS §11.8). */
export interface OrderTicketDepot {
  depotId: DepotId;
  number: string;
  bankName: string;
  conditions: DepotConditions;
  clearingBalance: Cents;
  /** Reservations of the depot's active buy orders. */
  reserved: Cents;
  /** The depot's position in the instrument; `null` without one. */
  position: PositionView | null;
}

/** Live state of the order ticket (US-HD-01–03): it follows the quote, the clock and the books. */
export interface OrderTicketContext {
  instrument: Instrument;
  /** The last quote without a venue mark-up; `null` until it arrives and for indices. */
  quote: ExchangeQuote | null;
  /** The instrument's mid price is at the floor (E-22). */
  atPriceFloor: boolean;
  /** Whether the instrument's exchange trades now; `null` while unknown. */
  marketOpen: boolean | null;
  tick: Tick;
  /** The open depots in account order. */
  depots: OrderTicketDepot[];
  taxYear: TaxYear | null;
}

export const ORDER_SIZE_KINDS = ['quantity', 'amount'] as const;
export type OrderSizeKind = (typeof ORDER_SIZE_KINDS)[number];

/** Values of the controls of the order ticket; number fields hold the text as typed. */
export interface OrderTicketModel {
  depotId: string;
  side: OrderSide;
  /** Sales are always by quantity. */
  sizeKind: OrderSizeKind;
  quantity: string;
  amount: Cents | null;
  type: OrderType;
  limit: string;
  stop: string;
  validity: OrderValidityKind;
  /** Value of the date input (`2030-05-15`) for the validity `date`. */
  validityDate: string;
}
