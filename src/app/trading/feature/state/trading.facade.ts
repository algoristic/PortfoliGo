import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { DepotId } from '@app/banking/domain/models/account.model';
import { PositionView } from '@app/engine/domain/models/trading-view.model';
import { OrderChange, OrderSpec } from '@app/trading/domain/models/order.model';
import { SavingsPlanId } from '@app/trading/domain/models/savings-plan.model';
import { ExchangeQuote } from '@app/trading/domain/order-preview-logic';
import { ChangeOrderContext } from '@app/trading/ui/models/change-order.model';
import { OrderTicketContext } from '@app/trading/ui/models/order-ticket.model';
import { SavingsPlanEntry } from '@app/trading/ui/models/savings-plan.model';

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
  openOrderEntries$ = this.#store.pipe(select(TradingSelectors.selectOpenOrderEntries));
  orderHistoryEntries$ = this.#store.pipe(select(TradingSelectors.selectOrderHistoryEntries));
  depotReservations$ = this.#store.pipe(select(TradingSelectors.selectDepotReservations));
  savingsPlanEntries$ = this.#store.pipe(select(TradingSelectors.selectSavingsPlanEntries));
  /** Next executions of the active savings plans, earliest first (for „Demnächst“, AP 5.7). */
  upcomingSavingsPlans$ = this.#store.pipe(select(TradingSelectors.selectUpcomingSavingsPlans));
  savingsPlanInstruments$ = this.#store.pipe(select(TradingSelectors.selectSavingsPlanInstruments));
  savingsPlanDepots$ = this.#store.pipe(select(TradingSelectors.selectSavingsPlanDepots));

  position$(depotId: DepotId, instrumentId: string): Observable<PositionView | null> {
    return this.#store.pipe(select(TradingSelectors.selectPosition(depotId, instrumentId)));
  }

  orderTicketContext$(instrumentId: string): Observable<OrderTicketContext | null> {
    return this.#store.pipe(select(TradingSelectors.selectOrderTicketContext(instrumentId)));
  }

  changeOrderContext$(orderId: string): Observable<ChangeOrderContext | null> {
    return this.#store.pipe(select(TradingSelectors.selectChangeOrderContext(orderId)));
  }

  depotSavingsPlanEntries$(depotId: DepotId | null): Observable<SavingsPlanEntry[] | null> {
    return this.#store.pipe(select(TradingSelectors.selectDepotSavingsPlanEntries(depotId)));
  }

  exchangeQuote$(instrumentId: string): Observable<ExchangeQuote | null> {
    return this.#store.pipe(select(TradingSelectors.selectExchangeQuote(instrumentId)));
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

  clickChangeOrder(orderId: string): void {
    this.#store.dispatch(TradingActions.clickedChangeOrder({ orderId }));
  }

  clickCancelOrder(orderId: string): void {
    this.#store.dispatch(TradingActions.clickedCancelOrder({ orderId }));
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

  /** Opens „Sparplan anlegen“, for the instrument and in the depot when given (US-HD-05). */
  clickCreateSavingsPlan(instrumentId?: string, depotId?: DepotId): void {
    this.#store.dispatch(
      TradingActions.clickedCreateSavingsPlan({
        ...(instrumentId === undefined ? {} : { instrumentId }),
        ...(depotId === undefined ? {} : { depotId }),
      }),
    );
  }

  clickChangeSavingsPlan(savingsPlanId: SavingsPlanId): void {
    this.#store.dispatch(TradingActions.clickedChangeSavingsPlan({ savingsPlanId }));
  }

  clickDeleteSavingsPlan(savingsPlanId: SavingsPlanId): void {
    this.#store.dispatch(TradingActions.clickedDeleteSavingsPlan({ savingsPlanId }));
  }

  /** The savings plan dialog shows the costs and shares at this instrument's ask. */
  selectSavingsPlanInstrument(instrumentId: string): void {
    this.#store.dispatch(TradingActions.selectedSavingsPlanInstrument({ instrumentId }));
  }

  setSavingsPlanPaused(savingsPlanId: SavingsPlanId, paused: boolean): void {
    this.#store.dispatch(TradingActions.submittedSetSavingsPlanPaused({ savingsPlanId, paused }));
  }
}
