import { isEngineCommandError } from '@app/engine/feature/state/session.utils';

/** What the slice asks of the engine; each has its own text when it fails. */
export type NotificationRequest = 'load' | 'markRead' | 'setAutoPause' | 'absenceReport';

/**
 * Text of a failed notification command or query (TS §8.6): the reason for the codes of the
 * notification rules, a running catch-up or jump and a failed write, otherwise what could not be
 * done.
 */
export function notificationFailureMessage(request: NotificationRequest, error: unknown): string {
  if (isEngineCommandError(error, 'unknown-notification-code')) {
    return $localize`:@@featureNotifications-notificationsErrors-unknownNotificationCode:Für dieses Ereignis lässt sich die automatische Pause nicht einstellen.`;
  }
  if (isEngineCommandError(error, 'unknown-notification')) {
    return $localize`:@@featureNotifications-notificationsErrors-unknownNotification:Diese Benachrichtigung gibt es nicht. Die Liste wird neu geladen.`;
  }
  if (isEngineCommandError(error, 'busy')) {
    return $localize`:@@featureNotifications-notificationsErrors-busy:Das geht gerade nicht, weil die Spielzeit noch berechnet wird.`;
  }
  if (isEngineCommandError(error, 'storage-failed')) {
    return $localize`:@@featureNotifications-notificationsErrors-storageFailed:Die Änderung konnte nicht gespeichert werden und wurde nicht übernommen.`;
  }
  switch (request) {
    case 'load':
      return $localize`:@@featureNotifications-notificationsErrors-loadFailure:Die Benachrichtigungen konnten nicht geladen werden.`;
    case 'markRead':
      return $localize`:@@featureNotifications-notificationsErrors-markReadFailure:Die Benachrichtigungen konnten nicht als gelesen markiert werden.`;
    case 'setAutoPause':
      return $localize`:@@featureNotifications-notificationsErrors-setAutoPauseFailure:Die automatische Pause konnte nicht geändert werden.`;
    case 'absenceReport':
      return $localize`:@@featureNotifications-notificationsErrors-absenceReportFailure:Der Abwesenheitsbericht konnte nicht geladen werden.`;
  }
}
