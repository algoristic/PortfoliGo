import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { DepotId } from '@app/banking/domain/models/account.model';
import { PositionView } from '@app/engine/domain/models/trading-view.model';
import { OrderChange, OrderSpec } from '@app/trading/domain/models/order.model';
import { OrderTicketContext } from '@app/trading/ui/models/order-ticket.model';

import * as TradingActions from './trading.actions';
import { OrderCommand } from './trading.model';
import * as TradingSelectors from './trading.selectors';

@Injectable()
export class TradingFacade {
  readonly #store = inject(Store);

  orders$ = this.#store.pipe(select(TradingSelectors.selectOrders));
  openOrders$ = this.#store.pipe(select(TradingSelectors.selectOpenOrders));
  orderHistory$ = this.#store.pipe(select(TradingSelectors.selectOrderHistory));
  depots$ = this.#store.pipe(select(TradingSelectors.selectDepots));
  openDepots$ = this.#store.pipe(select(TradingSelectors.selectOpenDepots));
  tradingLoaded$ = this.#store.pipe(select(TradingSelectors.selectTradingLoaded));
  pending$ = this.#store.pipe(select(TradingSelectors.selectPending));
  routeInstrumentTrade$ = this.#store.pipe(select(TradingSelectors.selectRouteInstrumentTrade));

  position$(depotId: DepotId, instrumentId: string): Observable<PositionView | null> {
    return this.#store.pipe(select(TradingSelectors.selectPosition(depotId, instrumentId)));
  }

  orderTicketContext$(instrumentId: string): Observable<OrderTicketContext | null> {
    return this.#store.pipe(select(TradingSelectors.selectOrderTicketContext(instrumentId)));
  }

  isPending$(command: OrderCommand): Observable<boolean> {
    return this.#store.pipe(select(TradingSelectors.selectIsPending(command)));
  }

  clickBuy(instrumentId: string, depotId?: DepotId): void {
    this.#store.dispatch(
      TradingActions.clickedBuy(
        depotId === undefined ? { instrumentId } : { instrumentId, depotId },
      ),
    );
  }

  clickSell(instrumentId: string, depotId?: DepotId): void {
    this.#store.dispatch(
      TradingActions.clickedSell(
        depotId === undefined ? { instrumentId } : { instrumentId, depotId },
      ),
    );
  }

  placeOrder(order: OrderSpec): void {
    this.#store.dispatch(TradingActions.submittedPlaceOrder({ order }));
  }

  changeOrder(orderId: string, change: OrderChange): void {
    this.#store.dispatch(TradingActions.submittedChangeOrder({ orderId, change }));
  }

  cancelOrder(orderId: string): void {
    this.#store.dispatch(TradingActions.submittedCancelOrder({ orderId }));
  }
}
