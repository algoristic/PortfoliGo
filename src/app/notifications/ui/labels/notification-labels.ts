import {
  NotificationCategory,
  NotificationCode,
  NotificationSeverity,
} from '@app/notifications/domain/models/notification.model';
import { OrderRejection } from '@app/trading/domain/models/order.model';

/** Names of the categories of the notification centre (PS US-BN-01, TS §12). */
export function notificationCategoryLabel(category: NotificationCategory): string {
  switch (category) {
    case 'account':
      return $localize`:@@uiNotifications-notificationLabels-account:Konto`;
    case 'order':
      return $localize`:@@uiNotifications-notificationLabels-order:Order`;
    case 'earnings':
      return $localize`:@@uiNotifications-notificationLabels-earnings:Erträge`;
    case 'taxes':
      return $localize`:@@uiNotifications-notificationLabels-taxes:Steuern`;
    case 'savings-plan':
      return $localize`:@@uiNotifications-notificationLabels-savingsPlan:Sparplan`;
    case 'system':
      return $localize`:@@uiNotifications-notificationLabels-system:System`;
  }
}

export function notificationSeverityLabel(severity: NotificationSeverity): string {
  switch (severity) {
    case 'hint':
      return $localize`:@@uiNotifications-notificationLabels-hint:Hinweis`;
    case 'info':
      return $localize`:@@uiNotifications-notificationLabels-info:Info`;
    case 'warning':
      return $localize`:@@uiNotifications-notificationLabels-warning:Warnung`;
    case 'critical':
      return $localize`:@@uiNotifications-notificationLabels-critical:Kritisch`;
  }
}

/** Several notifications of one severity, e.g. „3 Warnungen“ in a bundled toast (TS §12). */
export function notificationCountLabel(severity: NotificationSeverity, count: number): string {
  switch (severity) {
    case 'hint':
      return $localize`:@@uiNotifications-notificationLabels-hintCount:${count}:count: Hinweise`;
    case 'info':
      return $localize`:@@uiNotifications-notificationLabels-infoCount:${count}:count: Meldungen`;
    case 'warning':
      return $localize`:@@uiNotifications-notificationLabels-warningCount:${count}:count: Warnungen`;
    case 'critical':
      return $localize`:@@uiNotifications-notificationLabels-criticalCount:${count}:count: kritische Meldungen`;
  }
}

/**
 * Short name of a code: the title of a notification without its parameters, the reason of an
 * auto-pause („Pausiert: Dispo überschritten“) and the switch on the settings page.
 */
export function notificationCodeLabel(code: NotificationCode): string {
  switch (code) {
    case 'account-uncovered':
      return $localize`:@@uiNotifications-notificationLabels-accountUncovered:Konto nicht gedeckt`;
    case 'overdraft-limit-exceeded':
      return $localize`:@@uiNotifications-notificationLabels-overdraftLimitExceeded:Dispo überschritten`;
    case 'standing-order-failed':
      return $localize`:@@uiNotifications-notificationLabels-standingOrderFailed:Dauerauftrag nicht ausgeführt`;
    case 'order-executed':
      return $localize`:@@uiNotifications-notificationLabels-orderExecuted:Order ausgeführt`;
    case 'order-rejected':
      return $localize`:@@uiNotifications-notificationLabels-orderRejected:Order abgelehnt`;
    case 'order-expired':
      return $localize`:@@uiNotifications-notificationLabels-orderExpired:Order verfallen`;
    case 'savings-plan-executed':
      return $localize`:@@uiNotifications-notificationLabels-savingsPlanExecuted:Sparplan ausgeführt`;
    case 'savings-plan-failed':
      return $localize`:@@uiNotifications-notificationLabels-savingsPlanFailed:Sparplan fehlgeschlagen`;
    case 'dividend-received':
      return $localize`:@@uiNotifications-notificationLabels-dividendReceived:Dividende erhalten`;
    case 'interest-credited':
      return $localize`:@@uiNotifications-notificationLabels-interestCredited:Zinsen gutgeschrieben`;
    case 'tax-refund':
      return $localize`:@@uiNotifications-notificationLabels-taxRefund:Steuererstattung`;
    case 'month-closed':
      return $localize`:@@uiNotifications-notificationLabels-monthClosed:Monatsabschluss`;
    case 'year-closed':
      return $localize`:@@uiNotifications-notificationLabels-yearClosed:Steuerjahr abgeschlossen`;
    case 'storage-quota-exceeded':
      return $localize`:@@uiNotifications-notificationLabels-storageQuotaExceeded:Speicher voll`;
    case 'market-checksum-mismatch':
      return $localize`:@@uiNotifications-notificationLabels-marketChecksumMismatch:Kursdaten weichen ab`;
    case 'backup-reminder':
      return $localize`:@@uiNotifications-notificationLabels-backupReminder:Sicherung empfohlen`;
  }
}

/** Why an order was rejected at execution (TS §7.5), as a sentence. */
export function orderRejectionLabel(reason: OrderRejection): string {
  switch (reason) {
    case 'insufficient-funds':
      return $localize`:@@uiNotifications-notificationLabels-rejectionInsufficientFunds:Das Guthaben auf dem Verrechnungskonto reicht nicht.`;
    case 'price-floor':
      return $localize`:@@uiNotifications-notificationLabels-rejectionPriceFloor:Der Kurs liegt an der Preisuntergrenze.`;
    case 'amount-too-small':
      return $localize`:@@uiNotifications-notificationLabels-rejectionAmountTooSmall:Der Betrag reicht nach Abzug der Kosten für keinen Kauf.`;
    case 'insufficient-quantity':
      return $localize`:@@uiNotifications-notificationLabels-rejectionInsufficientQuantity:Im Depot liegen nicht genug freie Stücke.`;
  }
}
