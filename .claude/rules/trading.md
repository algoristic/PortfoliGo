---
paths:
  - 'src/app/trading/**'
  - 'src/app/engine/domain/order-system*'
  - 'src/app/engine/domain/order-projection*'
  - 'src/app/engine/domain/game-engine-orders*'
  - 'src/app/engine/domain/game-engine-portfolio*'
  - 'src/app/engine/domain/distribution-system*'
  - 'src/app/engine/domain/valuation*'
  - 'src/app/engine/domain/savings-plan-system*'
  - 'src/app/engine/domain/game-engine-savings-plans*'
  - 'src/app/engine/domain/instrument-sessions*'
  - 'src/app/portfolio/**'
---

# Trading: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Order rules (`trading/domain`; AP 5.1a, 5.4; TS §7.5, §11.8)

- Models `models/order.model.ts`: `ORDER_TYPES` (`market`/`limit`/`stop`/`stop-limit`), validity `day`/`date`/`gtc`, `ORDER_STATUSES` (active = `open`/`triggered`), `OrderSpec`, `OrderChange`, `Order`. Size is `quantity` in millionths or `amount` in cents (buy only). Codes: `ORDER_COMMAND_ERRORS` (part of `ENGINE_ERRORS`), at execution `ORDER_REJECTIONS`. `ORDER_HISTORY_LENGTH` 500. `MIN_ORDER_VALUE` 100 cents (AP 7.3b): purchases below it get `order-value-too-small` when placed or changed (estimate `estimatedOrderValue`) and when executed (booked market value); sales are not limited.
- `order-validity-logic.ts`: `orderExpiry` („day“ ends with the next close of the instrument's exchange), `isOrderExpired`, `validityError` (at most a year).
- `order-execution-logic.ts`: `orderDecision` per tick at bid and ask, `midRulesOutExecution` (cheap pre-check), `amountOrderQuantity`, `orderFill`, `executionError`, `executionTransaction(order, fill, accounts, tick, mid, sale?)` (exchange fee booked as a bank fee; a sale adds `costBasis`/`realizedGain`).
- `order-reservation-logic.ts`: `orderReservation` with `RESERVATION_BUFFER` 5 %, `estimatedOrderValue` (unbuffered: market at the ask, stop at max(ask, stop), limit/stop-limit at the limit, amount as is), `reservedAmount`, `freeQuantity`.
- `order-command-logic.ts`: `orderPlacementError`, `orderChangeError`, `changedReservation`, `isAtPriceFloor`, shape guards `isOrderSpec`/`isOrderChange` (also the protocol guards).
- UI-side rules: `order-input-logic.ts` (`parseQuantityInput` → millionths, ≤ 6 decimals; `parsePriceInput` ≤ 4; `formatPriceInput`); `order-preview-logic.ts` (`venueQuote`: bid/ask with the bank's `spreadMarkup` estimated from the mark-up-free quote, at most one grid step wider than the engine's; `estimatedExecutionPrice`, table TS §11.8; `orderPreview` combines the engine's own `orderFill`, `orderReservation`, `freeFunds`, `orderPlacementError` and for sales `saleTaxPreview` — no copies).
- Tables TS §7.5; all these files are in the mutation tests.

## Positions, lots, payouts, valuation (AP 5.2; TS §6.5, §7.4, §7.6, §7.9)

- `trading/domain/models/position.model.ts`: `Position` (`lots`, `realizedGain`, `distributions` earned at ex-dates). `position-logic.ts`: `holdingOf`, `hasPositions`, `findPosition`, `bookPurchase` (lot cost = debit incl. costs), `saleOf`/`bookSale` (FIFO; realized = credit after costs − cost basis; an empty position is removed), `addDistribution`, `copyPosition`.
- `portfolio/domain`: `models/lot.model.ts` (`Lot`, `LotSale`), `lot-logic.ts` (`lotCostShare` exact with `BigInt`, `sellLots` FIFO, `lotTotals`, `averageCost` in euros, `costPerShare`); `models/distribution.model.ts` (`DISTRIBUTION_KINDS`, `PendingDistribution`), `distribution-logic.ts` (`distributionAmount`, `distributionPaymentTick` = 06:00 of the payment date, `pendingDistributionsFor`); `valuation-logic.ts` (`holdingsValue`: `marketValue(quantity, bid)` per holding).
- The journal keeps a sold-out position's history (`refs.instrumentId`).

## Savings plans (AP 5.6b; TS §7.8; US-HD-05)

- `trading/domain/models/savings-plan.model.ts`: `SavingsPlan` (`id` `sp-<n>`, `amount` in cents incl. costs, `day` 1–28, `handledUpTo` = month key), `SavingsPlanView` (`nextExecution`), `SAVINGS_PLAN_MIN_AMOUNT` 100 cents, `SAVINGS_PLAN_COMMAND_ERRORS` (part of `ENGINE_ERRORS`), `SAVINGS_PLAN_FAILURES` (`price-floor`/`insufficient-funds`/`amount-too-small`).
- `savings-plan-logic.ts`: `savingsPlanTarget`, `savingsPlanError`, `savingsPlanChangeError`, `savingsPlanCosts` = `fee(savingsPlanFee, amount)`, `savingsPlanQuantity` (largest millionths whose exact value rounded up fits), `savingsPlanFill`, `savingsPlanFailure` (whole amount vs. available after reservations), `savingsPlanTransaction(plan, fill, accounts, tick, mid)` (`buy`, refs `savingsPlanId`/`instrumentId`, costs as `orderFee`, `exchangeFee` 0), `savingsPlanPreview`.
- `savings-plan-schedule-logic.ts`: `savingsPlanExecutionTick` (= `nextOpen` from the day), `savingsPlanHandledBefore(day, hours, from)`, `savingsPlanDueMonth`, `savingsPlanNextExecution`, `nextSavingsPlanTick`. Tables TS §7.8; both in the mutation tests.

## Costs (AP 5.7c; TS §7.4; US-PF-07)

- `portfolio/domain/cost-estimate-logic.ts`: `spreadCost` (shares × distance of the price from the mid on the costly side, rounded like a market value) goes into `params.spreadCost` of executions and savings plan buys (mid = `quote.mid` of the execution's quote in `OrderSystem`/`SavingsPlanSystem`); `dailyTerCost(value, ter)` (value × TER ÷ 365, unrounded cents) feeds the monthly values at the day change (`GameEngine.#terCosts`, ETFs of `world.etfs`). In the mutation tests. Monthly values side: see `banking.md`.

## Performance and benchmark rules (AP 5.7a; TS §7.9, §8.2; US-PF-01, -04, -05; E-28)

- `portfolio/domain/models/performance.model.ts` (`DailyPoint.totalFlow` cumulative, `HISTORY_RANGES`, `SERIES_RESOLUTIONS`); `performance-logic.ts`: `externalFlow` = postings on employer and living costs; `dailyReturn` with flows at the start, `null` for `V_start + CF ≤ 0`, factor never below 0; `annualizedReturn` act/365, `null` under 365 days; `periodReturns`; `startPerformance` (start capital = `V_0`, not a flow); `addFlow`; `investAtClose` (units ≥ 0, a remainder stays as negative cash); `benchmarkValue`; `closeDay` (point and next day; year start from the end of 31.12.); `performanceFigures` (today without flows; since start = `netWorth − comparison`); `historyFromDay`, `HISTORY_RANGE_MONTHS`; `thinPoints` (first point + last per day/week/month/year). In the mutation tests with `engine/domain/performance-system.ts` (engine side: see `engine.md`).

## Depot views (`portfolio/domain`; AP 5.5a/b; TS §7.9)

- `models/portfolio.model.ts` (`POSITION_SORT_KEYS`, `DEFAULT_POSITION_SORT` = value descending), `position-overview-logic.ts`: `combinePositions` per instrument („Alle Depots“), `positionOverview` (average cost via `costPerShare`, price = bid without mark-up, `marketValue`, gain, ratio, share; a missing quote makes value, gain, sums and shares `null`), `nextPositionSort`, `sortPositions` (missing values last, ties by name `de`).
- `models/allocation.model.ts` (`ASSET_CLASSES` `stock`/`etf`/`cash`, `UNASSIGNED`), `allocation-logic.ts`: `apportionCents` (largest remainder), `allocate`, `assetClassAllocation` (cash ≥ 0), `regionAllocation`/`sectorAllocation` with ETF look-through (no composition → `unassigned`).
- `position-detail-logic.ts`: `positionDetail(parts, name, bid)` (head figures through `positionOverview`, realized gain and distributions summed, lots of all shown depots by `buyTick`, `null` without shares); `positionTrades(journal, instrumentId, depotIds | null, limit)` → `PositionTrades` `{ trades, total }`: `buy`/`sell` transactions with a unit posting of the instrument in a shown depot (order executions `refs.orderId` and savings plan buys `refs.savingsPlanId`), newest first, at most `limit`; `MAX_POSITION_TRADES` 200 in `models/position-detail.model.ts`.
- Tables TS §7.9; properties (shares sum to 1, look-through keeps the value); all in the mutation tests.

## Engine (TS §7.5, §7.6, §7.8)

- `OrderSystem` (`engine/domain/order-system.ts`) on `PlayerState.orders` (active, placement order), `orderHistory` (closed, oldest first, ≤ 500), `orderSequence` (`ord-<n>`), `positions`. Commands `placeOrder` (result `orderId`), `changeOrder`, `cancelOrder`. Checks active orders only in ticks with an open exchange (`needsTick`; `runUntil` processes only those ticks); a new or changed order is checked at once when its exchange is open (market orders execute during the pause). Expiry by the task `order-expiry`. Executions book through the banking system, lots via `bookPurchase`/`bookSale`, then the tax on `realizedGain` via the hook `taxCapitalIncome` (refs `orderId`, `depotId`, `instrumentId`).
- Events `order-triggered`, `order-executed` (carries `tax`; credit after costs and taxes = `total − tax`, US-HD-02), `order-rejected`, `order-expired`; notifications in `notification-system.ts`.
- Reservations lower `available` of clearing accounts (`availableAfterReservations`; `AccountView.reserved`, see `banking.md`). A depot with holdings, active orders or savings plans cannot close (`depot-not-empty`).
- `DistributionSystem` (`engine/domain/distribution-system.ts`): records entitlements at the ex-date's open (`exDate`, before the tick's orders), pays them in task `distribution-payment` (rank before `bank-run`) against `external:issuer:<instrument>`, then tax hook and event `distribution-paid`; `redirect`/`pendingFor` for closing accounts.
- `Valuation` (`engine/domain/valuation.ts`, bid of `quoteAt(…, 0)`), `GameEngine.securitiesValue()`.
- `SavingsPlanSystem` (`engine/domain/savings-plan-system.ts`, in the mutation tests) on `PlayerState.savingsPlans` (replaced on every change and run) and `savingsPlanSequence`. Commands `createSavingsPlan` (reply `savingsPlanId`), `changeSavingsPlan`, `setSavingsPlanPaused`, `deleteSavingsPlan` (host side: see `engine.md`). One task `savings-plan` (rank after `session-open`) at `nextSavingsPlanTick`, rescheduled after each accepted command and run; a run executes due plans in creation order at the ask with the bank's mark-up, books the lot and emits `savings-plan-executed` or `savings-plan-failed`. `GameEngine.savingsPlanViews()`.
- `instrument-sessions.ts` (`instrumentSessions`: series and trading hours per instrument), shared by `OrderSystem` and `SavingsPlanSystem`.

## Protocol and projection (AP 5.1c; TS §8.2–§8.4)

- Commands go through the host (write-ahead; `placeOrder` replies `{ tick, orderId }`; engine codes passed through). `drainChangedOrders()`/`drainChangedDepots()` feed the host.
- `projection.trading` (`TradingProjection`, `engine/domain/models/trading-view.model.ts`: `OrderView`, `DepotHoldingsView` with `positions` `{ instrumentId, quantity, free }`; `PositionView` adds `cost`, `lots`, `realizedGain`, `distributions`; values come from quotes in the UI), built by `tradingProjection` (`engine/domain/order-projection.ts`): full after `loadPlayer` (active orders, then history; all depots), else changed orders and depots plus the depot of each changed order.
- `EngineService`: order and savings plan commands, `trading$` (`TradingProjectionUpdate`: replace by ID, trim the history to `ORDER_HISTORY_LENGTH` in the UI; a depot missing from later updates after a full projection is empty), `savingsPlans$`, `positionTrades(request)`.
- Query `positionTrades` (`{ instrumentId, depotId?, limit? }`, guard `limit` 1–200): host reads the clearing accounts of the depot or all depots via `byAccount` plus unsaved transactions, up to the query tick.

## Trading slice and UI (AP 5.4a/b, 5.6b; TS §11.3, §11.4, §11.8; US-HD-01–05)

- Slice `trading` (`trading/feature/state`, `provideTradingState()` in `provideGameState()`, `TradingFacade`): orders as entities, `holdings` per depot, `tick`, `pending` per command, `savingsPlans` (`null` until the first projection). `watchTrading$` (full → `setAll`, else `upsertMany`, history trimmed by `droppedHistoryIds`), `watchSavingsPlans$`.
- Selectors (view rules in `trading.utils.ts`): `selectOpenOrders` (placement order), `selectOrderHistory` (newest first), `selectDepots`/`selectOpenDepots` (`DepotEntry`; reused by other slices), `selectPosition`, `selectRouteInstrumentTrade`, `selectOrderTicketContext(id)`, `selectOpen-`/`selectOrderHistoryEntries` (names, IDs as fallback), `selectDepotReservations`, `selectChangeOrderContext(id)` (ask with mark-up or `null`), `selectSavingsPlanEntries` (creation order), `selectDepotSavingsPlanEntries(depotId)`, `selectUpcomingSavingsPlans` (dashboard), `selectSavingsPlanInstruments` (ETFs first), `selectSavingsPlanDepots`, `selectExchangeQuote(id)`.
- Actions: `received…`, `clickedBuy`/`clickedSell` (`instrumentId`, optional `depotId`), `clicked{Change,Cancel}Order`, `clicked{Create,Change,Delete}SavingsPlan`, `selectedSavingsPlanInstrument`; `submittedX` → `xSuccess`/`xFailure` per engine command. Failure toasts via `orderCommandFailureMessage`/`savingsPlanCommandFailureMessage` (`trading-errors.utils.ts`, texts `*CommandErrorLabel` in `ui/labels`; `placeOrderShortfall` for `insufficient-funds`).
- `TradingDialogEffects` (`trading-dialogs.effects.ts`, dialogs with the game's `Injector`, quotes under a subscription key while open): `dialog-order-ticket` (`ORDER_TICKET_SUBSCRIPTION`), `dialog-change-order` (`ORDER_CHANGE_SUBSCRIPTION`), `dialog-savings-plan` (`SAVINGS_PLAN_SUBSCRIPTION`); cancel and delete via confirm dialogs; results → `submittedX`. Without an open depot: confirm „Kein Depot“ → `BankingActions.clickedOpenAccount` with kind „Depot“ preselected.
- Forms (Signal Forms, schemas in `trading/ui/schemas`, models in `ui/models`): `form-order-ticket` (`orderTicketSchema`, `orderTicketSpec`, `ticketPreview`; engine codes mapped to their field via `ticketFieldOf`; warning `trading.order-ticket.negative-credit` when a sale's credit after costs is negative, TS §7.4); `form-change-order` (`changeOrderSchema`; `orderChangeOf` sends only changed fields; engine check `orderChangeError`; stop of a triggered order `disabled`; a closed order → `order-not-active` on the form); savings plan dialog (`savingsPlanSchema({ feeOf, fixedTarget })`, `savingsPlanSpecOf`; preview with costs, shares at the ask, inflow hint).
- Texts in `trading/ui/labels`: `order-labels.ts` (`orderSideLabel`, `orderTypeLabel`, `orderStatusLabel`, `orderValidityLabel`, `orderCommandErrorLabel`), `savings-plan-labels.ts` (`savingsPlanCommandErrorLabel`, `savingsPlanRow`), `order-book-rows.ts` (`openOrderRow`, `closedOrderRow`).
- `trading/ui/trade-actions` (Kaufen/Verkaufen/„Sparplan anlegen“, `aria-disabled` with reason) on the instrument and position pages.
- Page `trading/feature/orders` (route `orders`, „Mehr“ menu, no guards: orders come with the projection), tabs „Offen“ (`ui/open-orders`, reservations per clearing account), „Historie“ (`ui/order-history`, costs = order + exchange fee) and „Sparpläne“ (`ui/savings-plan-list`, test IDs `trading.savings-plans.<id>.*`); cards below `md`; `focusIfLost` moves focus to the heading when the focused order disappears. Row texts in `ui/labels/order-book-rows.ts` (`OrderRow.priceNamed` for `limit`/`stop` avoids „Limit · Limit …“).

## Portfolio slice and UI (AP 5.5a/b, 5.7a; TS §11.3, §11.4, §11.7; US-PF-02, -03, -06)

- Slice `portfolio` (`portfolio/feature/state`, `providePortfolioState()` in `provideGameState()`, `PortfolioFacade`): `depotId` (`null` = all), `sort`, ETF compositions per market day, `trades`, `performance`, `historyRange` (`DEFAULT_HISTORY_RANGE` `1y`), `history`.
- Guards (`portfolio.guards.ts`): `enterPortfolioPage`/`leavePortfolioPage`, `enterPositionPage`/`leavePositionPage`, `enterPerformanceHistory`/`leavePerformanceHistory` (for any page with the history chart, e.g. the dashboard).
- Effects: `watchPortfolioQuotes$` (key `PORTFOLIO_SUBSCRIPTION`), `requestCompositions$`/`loadCompositions$` (missing ETF compositions of `selectMarketDay`), `openDepot$` (→ `BankingActions.clickedOpenAccount({ kind: 'depot' })`), `watchPerformance$`, `loadPerformanceHistory$` (on enter, new range and each new `selectPerformanceDay`, until leave; toast on failure), `loadPositionTrades$` (waits for phase `loaded`, loads on each new `selectPositionTradesLoad` key = instrument, chosen open depot or all, quantity/realized gain in the open depots; cancels older loads; toast on `loadPositionTradesFailure`).
- Selectors: `selectPortfolioView` (`portfolioView` in `portfolio.utils.ts`: `cash` = clearing account of the chosen depot or all open ones; allocation `null` while a quote is missing; `lookThroughPending`), `selectPositionDetailView` (`positionDetailView`: route instrument, depot chosen on the depot page or all open depots, `depotLabel` only with several shown depots, `chartTrades` oldest first, `tradesLoading` while loaded trades belong to another instrument/depot, `tradesTotal`), `selectPerformanceFigures`, `selectHistoryRange`, `selectPerformanceHistory` (a series of another range stays out).
- Page `portfolio/feature/portfolio`: depot select, empty states, `BreakpointObserver` `(min-width: 48rem)` switches table/cards, the depot's savings plans (`portfolio.savings-plans`). UI `portfolio/ui` (labels `labels/portfolio-labels.ts`): `portfolio-summary`, `position-table` (`aria-sort` header buttons, sum row in `tfoot`, `appValueFlash`, `compact` cards; Kaufen/Verkaufen per row), `allocation` (tabs Assetklasse/Region/Sektor, `charts/ui` donut with six colours, smallest joined as „Übrige“).
- Page `portfolio/feature/position` (route `portfolio/:instrumentId`, also the market guards `enterInstrumentPage`/`leaveInstrumentPage`): `market/ui/instrument-quote`, `trade-actions` with the shown depot, depot select, `position-summary`, `market/feature/instrument-chart` with `trades` markers, `lot-list`, `trade-list` (`tradeSideLabel(side, savingsPlan)` → „Sparplan-Kauf“; „Die neuesten n von m …“ `portfolio.position.trades.limited` when cut).

## Tests

- Engine scenarios: `game-engine-orders.spec.ts` (test banks of TS §7.5 plus `b0` without fees, `TestMarket`), `game-engine-portfolio.spec.ts` (ex-dates from the mini world's events), `game-engine-savings-plans.spec.ts` (incl. „US-PF-07: costs in the monthly values“); properties (orders, lots ↔ journal) in `engine-properties.spec.ts`; catch-up budget cases (`BUDGETS_MS.catchUpYear`: open orders, 30 positions, ten savings plans) in `engine.perf.spec.ts`.
- Host (`engine/data-access/worker`): `engine-host-orders.spec.ts`, `engine-host-savings-plans.spec.ts` (also `positionTrades`).
- Slice specs in `trading/feature/state` and `portfolio/feature/state`; schema specs in `trading/ui/schemas` (`change-order-schema.spec.ts` = TS §7.5 change table); `form-order-ticket.component.spec.ts`.
- Pages: `market/feature/instrument/instrument-trade.page.spec.ts` (buy/sell flows), `orders.page.spec.ts`, `portfolio.page.spec.ts`, `position.page.spec.ts`. System tests `e2e/trading.e2e.ts`, `e2e/portfolio.e2e.ts`.
