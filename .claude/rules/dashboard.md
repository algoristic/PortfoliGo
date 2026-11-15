---
paths:
  - 'src/app/dashboard/**'
  - 'src/app/engine/domain/upcoming-inputs*'
  - 'src/app/engine/domain/game-engine-upcoming*'
---

# Dashboard: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Domain (`dashboard/domain`; AP 5.7b/c; PS §10.3; TS §8.1, §11.3; US-PF-01, -04, -05, US-MK-06, US-UI-10, E-05)

In the mutation tests and under the determinism lint rule; tables TS §8.1, §11.3.

- `models/upcoming.model.ts`: `UPCOMING_DAYS` 14, `MAX_UPCOMING_DAYS` 28, `UPCOMING_KINDS` (tick order), `UpcomingEvent` (amount as magnitude or `null`), `UpcomingInputs`.
- `upcoming-logic.ts`: `upcoming(fromTick, days, inputs)` — bank runs with base salary and living costs, account fee via `monthlyAccountFee` (deposits so far plus a salary the window still credits), custody fee without amount, announced ex-dates and payments, pending payouts; `upcomingEnd`, `isInWindow`, `sortUpcoming`.
- `dividend-calendar-logic.ts`: `dividendCalendar(fromTick, inputs)` — earned payouts with payment ahead, announced ex-dates of held instruments summed over depots (each depot rounded), announced ex-dates of watchlist instruments without holding (`quantity`/`expected` `null`); no window; sorted by ex-date, then ID.
- `models/first-steps.model.ts` (`FIRST_STEPS_SETTINGS_VERSION`) + `first-steps-logic.ts`: `firstSteps(facts)`, `firstStepsDone`, `withoutFirstSteps`.
- `top-positions-logic.ts`: `topPositions` = `combinePositions` + `positionOverview`, value descending, 5.

## Engine (AP 5.7b/c; TS §8.2, §9.3)

- `engine/domain/upcoming-inputs.ts`: `upcomingInputs(world, state, sessions)` reads the state, runs nothing ahead: open current accounts with conditions and inflows, open depots with custody fee, ex-dates of held positions from today's scheduled `session-open` and the market state's `nextExDay`/`dividendCents`, pending distributions, `watchedDividends` (shared `announcedDates` per instrument).
- `GameEngine.upcoming(days)`, `dividendCalendar()`; host query `upcoming` (`days?` 1–28; result carries `dividends`; see `engine.md`), `EngineService.upcoming(days?)`.

## Slice (`dashboard/feature/state`)

- `provideDashboardState()` in `provideGameState()`, `DashboardFacade`. State: `upcoming` (`UpcomingResult`), `recentNotifications` (5), `playerId` + `firstSteps` (localStorage `pgo.ui.firstSteps` v1, per player `{ hidden, banksVisited }`, `parseStoredFirstSteps`; `PlayersService.deletePlayer` removes the player's entry).
- Guards `enterDashboardPage`/`leaveDashboardPage`. Route `dashboard` also runs `enterPerformanceHistory`/`leavePerformanceHistory` (portfolio) and `enterMonthlyValues`/`leaveMonthlyValues` (banking).
- Effects: `loadUpcoming$` (on enter, new day, projections with changed accounts or depots, changed confirmed watchlist; throttled `UPCOMING_THROTTLE_MS` 500), `loadRecentNotifications$` (`lastSeq`), `watchDashboardQuotes$` (key `DASHBOARD_SUBSCRIPTION`: all held instruments + first 5 of the watchlist), `loadFirstSteps$` (on `enterGame`), `saveFirstSteps$` (hide, show again via `clickedShowFirstSteps`, `BankingActions.enterBanksPage`; keeps other players' entries), `showFailure$`.
- Selectors (rules in `dashboard.utils.ts`): `selectUpcoming` (`upcomingEntries` merges standing orders, savings plans and active order expiries from the other slices, after now and up to the queried end), `selectDividendCalendar` (`dividendCalendarRows`: announced until the ex-date, earned until the payment, names), `selectTopPositions`, `selectWatchlistSummary`, `selectCashflow` (from `BankingSelectors.selectCurrentMonth`), `selectFirstSteps` (`null` while hidden), `selectFirstStepsHidden`.

## UI

- Page `dashboard/feature/dashboard` (grid 1/2/3 columns, `items-start`; button `dashboard.first-steps.show` below the tiles while hidden).
- `dashboard/ui` (view models `models/dashboard-view.model.ts`, texts `labels/dashboard-labels.ts`): `first-steps`, `net-worth-summary`, `net-worth-chart` (area of `charts/ui/price-chart`, one point per day at the day start, periods 1M–Max; views „Aufteilung“ (securities `chart-4`, cash `chart-2`) and „Vergleich“ (benchmark `chart-5`, „Ohne Anlegen“ `chart-6` dashed), legend, sr-only summary), `performance-figures`, `upcoming-list`, `dividend-calendar`, `cashflow`, `top-positions`, `watchlist-summary`, `recent-notifications`. Test IDs `dashboard.<tile>.*` (calendar: `dashboard.dividends.row` with `data-instrument-id`, `.name`, `.ex-date`, `.payment-date`, `.per-share`, `.expected`, `.watched`; `.empty`).

## Tests

- Engine scenarios `engine/domain/game-engine-upcoming.spec.ts` (base amounts and the fee the bank run then books; announced and scheduled ex-date; pending payout; dividend calendar of a held share; watched share only after the announcement).
- Page test `dashboard.page.spec.ts` (engine figures, monthly values and `performanceHistory` as oracles; first steps hidden after re-entering; 360 px); system test `e2e/dashboard.e2e.ts`.
