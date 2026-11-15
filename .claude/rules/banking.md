---
paths:
  - 'src/app/banking/**'
  - 'src/app/taxes/**'
  - 'src/app/engine/domain/banking-system*'
  - 'src/app/engine/domain/bank-commands*'
  - 'src/app/engine/domain/account-projection*'
  - 'src/app/engine/domain/testing/banking-game*'
---

# Banking and taxes: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Accounts and ledger (AP 2.4, 3.1; TS §7.2, §7.3)

- Framework-free `banking/domain`. Home bank: `findHomeBank`, `PlayerState.homeBankId`.
- `models/account.model.ts` (`ACCOUNT_KINDS` `current`/`savings`/`clearing`, depots), `models/bank-conditions.model.ts`. `account-logic.ts`: `acc-<n>`/`dep-<n>` IDs and ten-digit numbers from one counter per player (`accountSequence`).
- Ledger (`models/ledger.model.ts`: `TRANSACTION_TYPES`, external counter accounts such as `EMPLOYER_ACCOUNT`, `bankFeesAccount(id)`, `external:tax-office`). `ledger-logic.ts`: `bookTransaction(balances, seq, draft)` throws unless ≥ 2 postings, whole cents, sum 0 and known accounts; sets `balanceAfter` per posting. `journalBalances`.
- `fee-logic.ts` (`fee(model, volume)` per `FeeModel`, `custodyFee`), `interest-logic.ts` (act/365 daily interest unrounded; `bookedInterest` rounds only when booking).
- `GameEngine.start` opens `acc-1` at the home bank as salary account and books the start capital as transaction 1 (`opening-balance` against `external:opening-balance`; none for 0).
- Bookings collect in a buffer the host drains (`GameEngine.drainTransactions()`) into the `transactions` store (index `byAccount`; batching and snapshots in engine.md).

## Household and bank run (AP 3.2, 5.2, 5.6a; TS §3.8, §7.4)

- Rules in `banking/domain` (models `models/household.model.ts`): `calendar-month-logic.ts` (`monthOf`, `previousMonth`, `nextMonth`, `monthKey`, `BANK_RUN_TIME_OF_DAY`; re-exported by `bank-run-logic.ts` to avoid an import cycle), `bank-run-logic.ts` (`BANK_RUN_STEPS`, `bankRunPlan`, `nextBankRunTick`, `isInterestPayoutDue`, `startsQuarter`), `living-costs-logic.ts` (stream `life/living-costs/<YYYY-MM>`), `inflow-logic.ts`, `account-fee-logic.ts` (`monthlyAccountFee`, also used by the dashboard), `overdraft-logic.ts` (`overdraftLimits` per bank from the salary window, `availableAmount`), `monthly-values-logic.ts`, `custody-fee-logic.ts` (`quarterCustodyFee` = year rate × ¼ × days ÷ quarter days on `averageDepotValue`).
- `BankingSystem` (`engine/domain/banking-system.ts`) works on `PlayerState` (`interest` as `InterestAccrual` with running and pending credit/debit, `custody` per depot, …). Every booking goes through `book` (updates inflows and monthly values, emits `account-uncovered`/`overdraft-limit-exceeded`).
- Day change: accrue the previous day's interest on its end-of-day balance, custody (`accrueCustody(valueOf)`, end-of-day values from `Valuation`) and TER estimates (`accrueTerCosts`).
- `bank-run` task at 06:00 (`nextBankRunTick`), steps in order: limits, salary, credit interest (each followed by its tax and an `interest-credited` event), living costs, account fees, `custody-fee` (first bank working day of a quarter; params `from`, `to`, `days`, `averageValue`), overdraft and debit interest, `standing-orders`. Books only the pending interest of the settled period; skips amounts of 0.
- `month-end` closes monthly values, inflow window, interest period and moves the custody quarter to pending; `year-end` closes the tax year.
- `openAccount`/`registerAccount`, `openDepot` (adds custody accrual), `settleAccount(id, tick)` (interest up to the day before, fees up to the closing day; a clearing account adds closing custody fees).
- Test helpers `engine/domain/testing/banking-game.ts` (`startBankingGame`, `withTestBanks`, `withBooks`); scenarios in `banking-system.spec.ts`.

## Bank commands (AP 3.3, 5.2, 5.6a; TS §7.4, §8.2–§8.4)

- Commands `openAccount` (`depot` comes with a clearing account), `closeAccount` (settlement, remainder to `targetAccountId`), `setSalaryAccount`, `transfer`, `createStandingOrder`/`changeStandingOrder`/`setStandingOrderPaused`/`deleteStandingOrder`. Engine rules `engine/domain/bank-commands.ts`, pure checks `banking/domain/bank-command-logic.ts` (`MAX_PURPOSE_LENGTH`, `closingTargetError`). Codes `BANK_COMMAND_ERRORS` and `CLOSING_BLOCKERS` (`models/bank-command.model.ts`, part of `ENGINE_ERRORS`); missing or mistyped fields → `invalid-command`.
- Rejected game commands count as applied (replay never applies them later).
- Closing with payouts still due (`ClosingPreview.pendingDistributions`) needs a target; `BankCommands` redirects them via `DistributionSystem.redirect`. Standing orders on the account block closing (`standing-orders` blocker, between `depot-not-empty` and `negative-balance`).

## Standing orders (AP 5.6a; US-BK-10, TS §7.4)

- `models/standing-order.model.ts` (`so-<n>`, `day` 1–28, `handledUpTo` = month key up to which all dates are done), `standing-order-logic.ts` (`standingOrderError`, `dueMonth`, `nextExecution`, `canExecute`, …).
- `PlayerState.standingOrders` (array replaced on every change, creation order), `standingOrderSequence`. `GameEngine` reschedules the bank run after each accepted standing-order command. Due ones book a `transfer` with `refs.standingOrderId`, `params.purpose`; insufficient `available` (after reservations) emits `standing-order-failed` (see notifications.md).
- Tests: `engine/domain/game-engine-standing-orders.spec.ts`, `engine-host-standing-orders.spec.ts`.

## Projection and queries (AP 3.3, 3.4, 5.1b, 5.6a; TS §8.3, §8.6, §11.3)

- Event `projection` (`EngineService.projection$`: `tick`, `full`, changed `AccountView`s from `engine/domain/account-projection.ts`, `netWorth`); full after every `loadPlayer` and before every command reply, else ≤ 4/s. The host writes `netWorth` into `runtime` → `PlayerListEntry.netWorth`.
- `AccountView.reserved` = reservations of active buy orders (open clearing accounts only, else 0); `available` = max(0, available amount − reserved).
- `engine/domain/standing-order-projection.ts` → `EngineService.standingOrders$`. Queries on `EngineService`: `banks()`, `closingPreview(id)`, `monthlyValues()`, `statement` (newest first, `offset`/`limit` ≤ 200, `total`; search rules TS §7.2; `banking/domain/statement-logic.ts`: `mergeJournal`, `statementPage`). The worker search also matches security names via `StatementContext.instrumentNames` (filled by the host from the instrument catalog).

## Monthly values, earnings and costs (AP 3.5, 5.7b, 5.7c; TS §7.4, US-PF-07)

- `MonthlyValues` has 13 fields (fixtures need all; the protocol guard checks them): `orderFees`, `savingsPlanFees`, `accountFees`, `custodyFees` are parts of `fees` (split by transaction type and `refs.savingsPlanId`; `addToMonthlyValues` takes `type`/`refs`/`params`); the estimates `spreadCosts` (`params.spreadCost` of `buy`/`sell`) and `terCosts` (unrounded cents) are not in `fees` or spending.
- `income-costs-logic.ts`: `incomeAndCosts(closedMonths, current)` → `IncomeCostsYear[]` (`models/income-costs.model.ts`, `COST_KINDS`, `ESTIMATED_COST_KINDS`); TER rounded once per year; table in TS §7.4; in the mutation tests.

## Taxes (AP 3.2, 5.3, 5.5b; TS §7.7, §8.3, §11.3, §11.4; US-ST-01–04)

- `taxes/domain/tax-logic.ts`: `assessTaxableIncome(state, amount, kind)` (`TAXABLE_INCOME_KINDS`; only sales may be negative), `openTaxYear`/`closeTaxYear`, `lossCarryForwardOf`, `usedAllowance`, `taxYearSummary`, `taxPreview`, `saleTaxPreview(state, lots, quantity, proceeds)`. `TaxYear` (`models/tax.model.ts`): `losses` ≤ 0, `income` = sum of components, `withheld` = `paid − refunded`. Constants `CAPITAL_INCOME_TAX_RATE`, `SAVER_ALLOWANCE` in `tax-logic.ts`.
- `BankingSystem.taxCapitalIncome(tick, accountId, income, kind, refs)` books `tax`/`tax-refund` against `external:tax-office` right after the triggering credit on its account (sales: `realizedGain`, refs `orderId`/`depotId`/`instrumentId`; payouts: gross amount) and returns the delta; `OrderSystem` and `DistributionSystem` call it through ports. `closeYear` appends to `PlayerState.closedTaxYears` (oldest first).
- Projection `projection.taxes` (`TaxesProjection` `{ current, closed }`, `engine/domain/tax-projection.ts`), sent with `full` and whenever `player.taxYear` is a new object; `EngineService.taxes$`.
- Slice `taxes` (`provideTaxesState()` in `provideGameState()`, `TaxesFacade` incl. `saleTaxPreview$(lots, quantity, proceeds)`); `watchTaxes$` like `watchProjection$`. `selectTaxOverview` (running year first, then closed newest first); `selectSaleTaxPreview` is `null` without projection or for quantities the lots don't hold.
- Page `taxes/feature/taxes` (route `taxes`, „Mehr“ menu, no guards): rules in short, one `taxes/ui/tax-year` card per year (test IDs `taxes.year.*`, `data-year`).
- Tests: scenarios `engine/domain/game-engine-taxes.spec.ts` (broker without fees, market without spread, accumulating ETF), invariants in `engine-properties.spec.ts`, host test `engine-host-taxes.spec.ts`, page test `taxes.page.spec.ts`, system test `e2e/portfolio.e2e.ts`.

## Banking slice (AP 3.3–3.5, 5.6a, 5.7b, 5.7c; TS §11.3)

- `banking/feature/state`, `provideBankingState()` in `provideGameState()`, `BankingFacade`. Accounts as entities (closed ones kept), banks (loaded after `loadPlayerSuccess`), pending commands per kind (`isPending$(command)`), `standingOrders` (`null` until the first projection). `watchProjection$` takes the last full projection before the `loadPlayer` reply and every one after; `enterGame`/`leaveGame` reset the slice.
- Facade streams include `accounts$` (`null` until loaded), `accountTotals$`, `salaryAccount$`, `targetAccounts$(sourceId)`, `accountsOfBank$(bankId)`, `currentMonth$`, `incomeAndCosts$`, `upcomingStandingOrders$`, `instrumentNames$` (market slice).
- `submittedX` → `xSuccess`/`xFailure` with toasts; `bankCommandFailureMessage` (`banking-errors.utils.ts`) maps every code to German.
- Statement state holds only the open page's loaded window; account from the router store (`selectStatementAccountId`). `loadStatement$` runs once the session phase is `loaded`, on filter changes (search debounced, `STATEMENT_SEARCH_DEBOUNCE_MS`), for the window around the rendered rows (`statementWindowRequest`, pages of 50) and on projections of the account; scrolling waits for a running query (the worker answers sequentially). Periods via `statementPeriodRange` (`banking/domain`).
- `loadMonthlyValues$` runs between `enterAccountsPage`/`leaveAccountsPage` and between `enterMonthlyValues`/`leaveMonthlyValues` (dashboard); throttled refresh (`MONTHLY_VALUES_THROTTLE_MS`) on net-worth changes and month ends. Guard `enterBanksPage` (counts for „Erste Schritte“, see dashboard.md).
- Dialogs opened by `BankingDialogEffects` and mapped to `submittedX`: `dialog-open-account` (optional `bankId`/`kind` preselection; shows `ui/account-conditions`), `dialog-transfer` (`transferSchema`), `dialog-close-account` (shows `closingPreview`, asks for a target when payouts are pending), `dialog-salary-account`, `dialog-standing-order` (`standingOrderSchema`, `standingOrderPreselection`); delete via `openConfirmDialog`. Schemas in `banking/ui/schemas`.

## Pages and UI (AP 3.4, 3.5, 5.6a, 5.7c, M5 follow-up; TS §7.2, §8.6)

- Pages `banking/feature/accounts` (tabs „Konten“, „Monatsübersicht“, „Daueraufträge“, „Erträge und Kosten“; `banking.accounts.tabs.*`), `account-statement` (unknown account → empty state; guards `enterAccountStatementPage`/`leaveAccountStatementPage`), `banks` (`banking/ui/bank-table`, sorting in `bank-comparison-logic.ts`, conditions in words in `ui/labels/bank-conditions-text.ts`).
- `banking/ui`: `account-card`, `account-header` (both with an `[accountActions]` slot filled by `account-actions`), `account-totals`, `account-conditions`, `statement-filter`, `statement-list` (CDK virtual scrolling, 64 px rows, skeletons for unloaded rows), `monthly-overview`, `standing-order-list` (`banking.standing-orders.*`), `income-costs` (`banking.income-costs.*`). Labels `labels/banking-labels.ts`, pipe `accountKindLabel`.
- Statement texts `statement-list/statement-text.utils.ts` (`statementEntryText(entry, bankNames, instrumentNames?)`), rows `statement-list.utils.ts` (`statementRows`). Bookings with `refs.instrumentId` name the security (unknown name → ID); buys and sells add „<Stück> Stück zu <Kurs>“ (price with its grid's decimals). Names via `BankingFacade.instrumentNames$` → input `instrumentNames`.
- Net worth in the header (`shell.header.net-worth`, from `md`) and the player list (`players.list.<id>.net-worth`).

## Tests

- Page tests `accounts.page.spec.ts` (incl. standing orders, earnings and costs), `account-statement.page.spec.ts`; read amounts with `parseEuros`; virtual scrolling needs `installScrollViewport(height)` before rendering and `scrollTo(element, top)` (`src/testing/scroll-viewport.ts`); `select` in `src/testing/dom.ts` fires `input` and `change`. System test `e2e/banking.e2e.ts`. Perf budget `banking/feature/state/statement-page.perf.spec.ts` (Node with `@angular/compiler` and `@angular/localize/init`).
