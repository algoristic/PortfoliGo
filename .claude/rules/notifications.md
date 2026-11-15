---
paths:
  - 'src/app/notifications/**'
  - 'src/app/engine/domain/notification-system*'
---

# Notifications: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Catalogue and params (AP 3.6, 5.1c, 5.2, 5.3, 5.6a/b; TS §3.6, §12)

- `notifications/domain/models/notification.model.ts`: `NOTIFICATION_CODES`, `NOTIFICATION_CODE_INFO` (category, severity, source, toast/browser/auto-pause defaults), `AUTO_PAUSE_CODES`, `UiNotificationCode` (`backup-reminder`), one `*Params` interface per code. The engine creates them in `engine/domain/notification-system.ts` (`NotificationSystem`) from engine events of the same name; every params shape has a guard in `engine-service.utils.ts` (protocol guard).
- `order-executed` (`tax`: sale tax, refunds negative, 0 for purchases), `order-rejected`, `order-expired`; `dividend-received` (from `distribution-paid`); `standing-order-failed` (warning); `savings-plan-executed`/`-failed` (`reason` from `SAVINGS_PLAN_FAILURES`). A sale or payout with negative `tax` also creates `tax-refund` on the clearing account.
- `storage-quota-exceeded` stays unused: a notification can't be stored when storage is full; the engine posts the `warning` `storage-full` instead, shown as an error toast by `session.effects.ts` (AP 6.4, TS §9.5).

## Host, storage and protocol (AP 3.6; TS §8.3, §11.3)

- The host keeps the newest `MAX_STORED_NOTIFICATIONS` (1 000; `read-state-logic.ts`), pages via `notification-page-logic.ts`, and sends `notification` and `report`.
- `EngineService`: `notification$`, `report$`, `setAutoPause`, `markNotificationsRead({ upTo?, seqs? })`, `notifications({ category?, offset, limit })`, `absenceReport()`; `projection.notifications` (`lastSeq`, `unread`, `autoPause`), `clock.autoPause` (`{ seq, code }`).

## Auto-pause (AP 3.6, 6.7; E-35)

- `auto-pause-logic.ts`: `autoPauseApplies(mode, visible, backgroundMode)`, `shouldAutoPause(…, backgroundMode)`. The host pauses at the tick of an auto-pause code while visible (live or jumping, never while catching up), and also while hidden in `keep-speed`/`custom-speed`; in `realtime` and `pause` hidden events only go to the absence report. The pause at the `backgroundPauseAfter` deadline has no `autoPause` cause (clock bar shows a plain pause).
- UI: clock bar „Pausiert: <reason>“ (`ClockFacade.autoPause$`, input `autoPauseCode` of `clock-controls`); settings section „Automatisch pausieren“ (`settings/ui/auto-pause-settings`, switches per code grouped by category).

## Absence report (AP 3.6, 5.1c, 5.6b)

- `absence-report-logic.ts` (`openAbsence`, `tallyBookings`, `tallyNotifications`, `closeAbsence`, `isWarning`; `MAX_REPORT_WARNINGS`, `MAX_REPORT_ORDERS` = 50, `REPORT_ORDER_CODES` incl. `savings-plan-executed`). Created after a catch-up or a hidden period, only when something was booked or notified. Warnings (incl. rejected orders, `standing-order-failed`) are listed separately from executed/expired orders and savings plans.
- `AbsenceReportEffects` opens `notifications/feature/dialog-absence-report` once the status is `ready` (event, or `absenceReport()` after loading), each period once. Section „Orders und Sparpläne (n)“ (`notifications.absence-report.order`, `.order-count`, `.order-text`).

## Toast and browser channels (AP 3.6, 6.2, 6.3; TS §12, US-BN-04)

- Device overrides in `pgo.settings.notifications`; `notification-channel-logic.ts` (`hasNotificationChannel` – `backup-reminder` has no browser channel –, `notificationChannelEnabled`, `withNotificationChannel`, `effectiveNotificationChannels`, `parseNotificationChannelOverrides`). Token `NOTIFICATION_CHANNEL_SETTINGS` (`notifications/feature/state/notifications.config.ts`, root default: no overrides; wired in `app.providers.ts`). `PlayersEffects.remindBackup$` skips the reminder entirely when its toast is off.
- Toasts: `showToasts$` filters by channel on arrival, bundles per code within `TOAST_BUNDLE_WINDOW_MS` (1 s real time, a `PendingTask`) via `bundleNotifications(notifications, settings, channel)` (`notifications.utils.ts`).
- Browser: `NOTIFICATION_PORT` (`notifications/data-access/notification-port/notification-port.ts`: `permission()`, `requestPermission()`, `notify({ title, body, tag })`); `WebNotificationPort` shows through the active service worker registration (`data.onActionClick.default` `focusLastFocusedOrOpen`), else `new Notification` with focus on click. Fake: `provideFakeNotificationPort` (`data-access/testing`). `browser-notification-logic.ts`: `browserNotificationApplies(code, { visible, permission, settings })`, `browserNotificationTag` (`pgo-<code>`). `showBrowserNotifications$` on `receivedNotifications` uses `document.visibilityState` and the port permission, one notification per code and engine event; platform errors are dropped.

## Slice and UI (AP 3.6, 5.1c; TS §11.3)

- Slice `notifications` (`provideNotificationsState()` in `provideGameState()`; `NotificationsFacade`: `unread$`, `hasUnread$`, `autoPause$`, `category$`, `centerWindow$`, `accountNames$`, `instrumentNames$`); takes its projection part from `BankingActions.receivedProjection`.
- Centre page `notifications/feature/notifications` (guards `enterNotificationsPage`/`leaveNotificationsPage`, category filter, pages of 50, mark one/all read). Header bell with unread badge and `aria-label` with the number.
- `notifications/ui`: `notification-list`, `notification-filter`, `absence-report` (inputs `accountNames`, `instrumentNames`; dialog data `instrumentNames`). Texts in `notifications/ui/labels` (`notificationCodeLabel`, `notificationText(notification, accountNames, instrumentNames?)`, category/severity labels, `orderRejectionLabel`, `savingsPlanFailureLabel`). Shares with the decimals the millionths need, prices with `priceDecimals`; unknown instruments show their ID.

## Tests

- Page test `notifications.page.spec.ts` (overdrawn players of the mini world: start capital 0, bank run on 01.04.2030 06:00; hidden period → one browser notification, visible → none). System tests `e2e/notifications.e2e.ts` with `notifications.po.ts` (`createPlayerWith` for start conditions), `e2e/pwa-notifications.e2e.ts`.
