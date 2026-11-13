import { createFeatureSelector, createSelector } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import { selectAccounts } from '@app/banking/feature/state/banking.selectors';
import { selectExchanges, selectTick } from '@app/clock/feature/state/clock.selectors';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { DEFAULT_MARKET_CONFIG } from '@app/market/domain/default-market-config';
import {
  selectInstrumentEntities,
  selectQuoteEntities,
  selectRouteInstrument,
} from '@app/market/feature/state/market.selectors';
import { selectCurrentTaxYear } from '@app/taxes/feature/state/taxes.selectors';
import { isActive } from '@app/trading/domain/order-reservation-logic';

import { OrderCommand } from './trading.model';
import { ordersAdapter, TRADING_FEATURE_KEY, TradingState } from './trading.reducer';
import {
  changeOrderContext,
  compareByPlacement,
  compareNewestClosed,
  depotEntries,
  depotReservations,
  instrumentTradeView,
  orderBookEntries,
  orderTicketContext,
} from './trading.utils';

const selectState = createFeatureSelector<TradingState>(TRADING_FEATURE_KEY);
const { selectAll, selectEntities } = ordersAdapter.getSelectors();

/** Active and closed orders as the projection carried them. */
export const selectOrders = createSelector(selectState, selectAll);
export const selectOrderEntities = createSelector(selectState, selectEntities);
export const selectHoldings = createSelector(selectState, (state) => state.holdings);
export const selectPending = createSelector(selectState, (state) => state.pending);
/** The first full trading projection arrived. */
export const selectTradingLoaded = createSelector(selectState, (state) => state.tick !== null);

export const selectIsPending = (command: OrderCommand) =>
  createSelector(selectPending, (pending) => pending[command] > 0);

/** Open and triggered orders in placement order (US-HD-04). */
export const selectOpenOrders = createSelector(selectOrders, (orders): OrderView[] =>
  orders.filter((order) => isActive(order.status)).sort(compareByPlacement),
);

/** Closed orders newest first, at most `ORDER_HISTORY_LENGTH` (US-HD-04). */
export const selectOrderHistory = createSelector(selectOrders, (orders): OrderView[] =>
  orders.filter((order) => !isActive(order.status)).sort(compareNewestClosed),
);

/** Depots with bank, clearing account (available, reserved) and positions; closed ones too. */
export const selectDepots = createSelector(selectAccounts, selectHoldings, depotEntries);

export const selectOpenDepots = createSelector(selectDepots, (depots) =>
  depots.filter((depot) => depot.open),
);

/** The position of an instrument in a depot; `null` without holdings. */
export const selectPosition = (depotId: DepotId, instrumentId: string) =>
  createSelector(
    selectHoldings,
    (holdings) =>
      holdings[depotId]?.find((position) => position.instrumentId === instrumentId) ?? null,
  );

/** Buy and sell actions of the instrument page; `null` while the instrument is unknown. */
export const selectRouteInstrumentTrade = createSelector(
  selectRouteInstrument,
  selectDepots,
  (instrument, depots) => (instrument === null ? null : instrumentTradeView(instrument, depots)),
);

/**
 * Live state of the order ticket for an instrument (TS §11.8); `null` while the instrument or the
 * clock is unknown. It follows quotes, clock, accounts, holdings and the tax year.
 */
export const selectOrderTicketContext = (instrumentId: string) =>
  createSelector(
    selectInstrumentEntities,
    selectQuoteEntities,
    selectDepots,
    selectExchanges,
    selectTick,
    selectCurrentTaxYear,
    (instruments, quotes, depots, exchanges, tick, taxYear) => {
      const instrument = instruments[instrumentId];
      return instrument === undefined || tick === null
        ? null
        : orderTicketContext(
            instrument,
            quotes[instrument.series] ?? null,
            depots,
            exchanges,
            tick,
            taxYear,
            DEFAULT_MARKET_CONFIG.priceFloor,
          );
    },
  );

/** Open orders of the order book with instrument and depot names (US-HD-04). */
export const selectOpenOrderEntries = createSelector(
  selectOpenOrders,
  selectInstrumentEntities,
  selectDepots,
  orderBookEntries,
);

/** Closed orders of the order book, newest first, with instrument and depot names (US-HD-04). */
export const selectOrderHistoryEntries = createSelector(
  selectOrderHistory,
  selectInstrumentEntities,
  selectDepots,
  orderBookEntries,
);

/** Clearing accounts with reserved money (US-HD-04). */
export const selectDepotReservations = createSelector(selectDepots, depotReservations);

/**
 * Live state of the dialog „Order ändern“ (US-HD-04); `null` while the order, its depot or the
 * clock is unknown. It follows the order, the quote and the clearing account.
 */
export const selectChangeOrderContext = (orderId: string) =>
  createSelector(
    selectOrderEntities,
    selectInstrumentEntities,
    selectQuoteEntities,
    selectDepots,
    selectTick,
    (orders, instruments, quotes, depots, tick) => {
      const order = orders[orderId];
      const instrument = order === undefined ? undefined : instruments[order.instrumentId];
      return tick === null
        ? null
        : changeOrderContext(
            order,
            instrument,
            instrument === undefined ? null : (quotes[instrument.series] ?? null),
            depots,
            tick,
          );
    },
  );
