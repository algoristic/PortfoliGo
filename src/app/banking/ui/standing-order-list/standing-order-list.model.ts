import { AccountKind } from '@app/banking/domain/models/account.model';
import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';

/** An account of a standing order as the list names it; `bank` `null` until the banks are loaded. */
export interface StandingOrderAccount {
  kind: AccountKind;
  number: string;
  bank: { name: string } | null;
}

/** A standing order with its accounts; an account is `null` while the projection lacks it. */
export interface StandingOrderListItem extends StandingOrderView {
  from: StandingOrderAccount | null;
  to: StandingOrderAccount | null;
}

/** Pause (`paused: true`) or resume the standing order. */
export interface StandingOrderPauseChange {
  id: StandingOrderView['id'];
  paused: boolean;
}

export interface StandingOrderRow {
  id: StandingOrderView['id'];
  from: string;
  to: string;
  amount: number;
  day: number;
  purpose: string;
  paused: boolean;
  nextExecution: number | null;
  /** Names the order for the actions' `aria-label`, e.g. „500,00 € am 15.“. */
  name: string;
}
