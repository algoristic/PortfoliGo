import { DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { ChartTrade } from '@app/market/domain/chart-marker-logic';
import { PositionDetail } from '@app/portfolio/domain/models/position-detail.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { OrderSide } from '@app/trading/domain/models/order.model';

import { DepotOption } from './portfolio-view.model';

/** A lot of the position detail (US-PF-06); `depot` names the depot when several depots are shown. */
export interface LotRow {
  key: string;
  depot: string | null;
  buyTick: Tick;
  quantity: MicroUnits;
  cost: Cents;
  costPerShare: number | null;
}

/** An executed purchase or sale of the position detail (US-PF-06). */
export interface TradeRow {
  /** Running number of the transaction. */
  id: string;
  depot: string | null;
  side: OrderSide;
  /** A savings plan purchase rather than an order execution. */
  savingsPlan: boolean;
  tick: Tick;
  quantity: MicroUnits;
  price: number;
  costs: Cents;
  total: Cents;
}

/**
 * The position detail of the instrument in the route (US-PF-06) for the depot chosen on the depot
 * page (`depotId`, `null` = all depots combined).
 */
export interface PositionDetailView {
  instrumentId: string;
  name: string;
  depots: DepotOption[];
  depotId: DepotId | null;
  /** The head figures and lots; `null` when the shown depots hold no shares. */
  detail: PositionDetail | null;
  lots: LotRow[];
  /** The newest trades (order executions and savings plan purchases), newest first. */
  trades: TradeRow[];
  /** The trades of the shown instrument and depots are still loading. */
  tradesLoading: boolean;
  /** Number of all trades; more than `trades` holds when the query limit cut them. */
  tradesTotal: number;
  /** The trades as markers for the chart, oldest first. */
  chartTrades: ChartTrade[];
}
