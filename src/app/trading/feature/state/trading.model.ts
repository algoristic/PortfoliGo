import { DepotId } from '@app/banking/domain/models/account.model';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { PositionView } from '@app/engine/domain/models/trading-view.model';
import { Bank } from '@app/world/domain/models/bank.model';

/** Quote subscription of the open order ticket (TS §8.4, §11.3). */
export const ORDER_TICKET_SUBSCRIPTION = 'order-ticket';

/** The order commands of the slice (TS §8.2); each has its own pending count. */
export const ORDER_COMMANDS = ['placeOrder', 'changeOrder', 'cancelOrder'] as const;
export type OrderCommand = (typeof ORDER_COMMANDS)[number];

/** Commands sent to the engine and not yet answered, per command. */
export type PendingOrderCommands = Record<OrderCommand, number>;

/**
 * A depot with its bank and clearing account (TS §7.3): balance, available amount and reservations
 * come from the account, the positions from the trading projection.
 */
export interface DepotEntry {
  depotId: DepotId;
  number: string;
  /** `null` until the banks are loaded. */
  bank: Bank | null;
  clearingAccount: AccountEntry;
  open: boolean;
  positions: PositionView[];
}
